const assert = require('node:assert/strict');
const test = require('node:test');

const createFilesService = require('../services/files.service');

test('createSignedUploadUrl requests Supabase overwrite support', async () => {
    let receivedPath;
    let receivedOptions;
    const supabase = {
        storage: {
            from(bucket) {
                assert.equal(bucket, 'ifc-private');
                return {
                    async createSignedUploadUrl(path, options) {
                        receivedPath = path;
                        receivedOptions = options;
                        return { data: { signedUrl: 'https://upload.example.test' }, error: null };
                    }
                };
            }
        }
    };

    const service = createFilesService(supabase);
    const result = await service.createSignedUploadUrl('revit_exports/project/model/file.ifc');

    assert.equal(result.signedUrl, 'https://upload.example.test');
    assert.equal(receivedPath, 'revit_exports/project/model/file.ifc');
    assert.deepEqual(receivedOptions, { upsert: true });
});

test('createFile updates an existing project filename instead of creating a duplicate', async () => {
    const calls = [];
    const existing = { id: 'existing-file-id', project_id: 'project-id', filename: 'A.ifc' };
    const uploadedAt = '2026-07-01T10:15:00.000Z';
    const updated = { ...existing, path: 'new/path/A.ifc', size: 42, original_name: 'A.ifc', uploaded_at: uploadedAt };

    const supabase = {
        from(table) {
            assert.equal(table, 'files');
            const builder = {
                select() {
                    calls.push('select');
                    return builder;
                },
                eq(column, value) {
                    calls.push(['eq', column, value]);
                    return builder;
                },
                maybeSingle() {
                    calls.push('maybeSingle');
                    return Promise.resolve({ data: existing, error: null });
                },
                update(payload) {
                    calls.push(['update', payload]);
                    return builder;
                },
                single() {
                    calls.push('single');
                    return Promise.resolve({ data: updated, error: null });
                }
            };
            return builder;
        }
    };

    const service = createFilesService(supabase);
    const result = await service.createFile(null, 'project-id', 'A.ifc', 'new/path/A.ifc', 42, 'Tester', {
        uploadedAt
    });

    assert.equal(result.id, 'existing-file-id');
    assert.equal(result.path, 'new/path/A.ifc');
    assert.equal(result.upload_date, uploadedAt);
    assert.ok(calls.some(call => Array.isArray(call) && call[0] === 'update'));
    assert.ok(calls.some(call => Array.isArray(call) && call[0] === 'update' && call[1].uploaded_at === uploadedAt));
    assert.ok(!calls.some(call => Array.isArray(call) && call[0] === 'update' && Object.prototype.hasOwnProperty.call(call[1], 'upload_date')));
    assert.ok(!calls.some(call => Array.isArray(call) && call[0] === 'insert'));
});

test('getFileById maps uploaded_at to upload_date for the dashboard API', async () => {
    const uploadedAt = '2026-07-01T11:30:00.000Z';
    const supabase = {
        from(table) {
            assert.equal(table, 'files');
            const builder = {
                select() {
                    return builder;
                },
                eq() {
                    return builder;
                },
                single() {
                    return Promise.resolve({
                        data: {
                            id: 'file-id',
                            filename: 'GP5-10.ifc',
                            uploaded_at: uploadedAt
                        },
                        error: null
                    });
                }
            };
            return builder;
        }
    };

    const service = createFilesService(supabase);
    const result = await service.getFileById('file-id');

    assert.equal(result.upload_date, uploadedAt);
});

test('getFilesByProjectId exposes only active unexpired share tokens', async () => {
    const now = new Date();
    const future = new Date(now.getTime() + 60_000).toISOString();
    const past = new Date(now.getTime() - 60_000).toISOString();
    const files = [
        { id: 'file-a', filename: 'A.ifc', project_id: 'project-id', model_version_id: 'version-a' },
        { id: 'file-b', filename: 'B.ifc', project_id: 'project-id', model_version_id: 'version-b' }
    ];
    const shares = [
        { model_version_id: 'version-a', token: 'active-token', expires_at: future, created_at: future },
        { model_version_id: 'version-b', token: 'expired-token', expires_at: past, created_at: future }
    ];

    const supabase = {
        from(table) {
            if (table === 'files') {
                const builder = {
                    select() { return builder; },
                    eq(column, value) {
                        assert.equal(column, 'project_id');
                        assert.equal(value, 'project-id');
                        return Promise.resolve({ data: files, error: null });
                    }
                };
                return builder;
            }

            assert.equal(table, 'shares');
            const builder = {
                select() { return builder; },
                in(column, values) {
                    assert.equal(column, 'model_version_id');
                    assert.deepEqual(values, ['version-a', 'version-b']);
                    return builder;
                },
                or() { return builder; },
                order() { return Promise.resolve({ data: shares, error: null }); }
            };
            return builder;
        }
    };

    const service = createFilesService(supabase);
    const result = await service.getFilesByProjectId('project-id');

    assert.equal(result.find(file => file.id === 'file-a').share_token, 'active-token');
    assert.equal(result.find(file => file.id === 'file-b').share_token, null);
});

test('updateFile translates legacy upload_date input to uploaded_at column', async () => {
    let updatePayload;
    const uploadedAt = '2026-07-01T12:00:00.000Z';
    const supabase = {
        from(table) {
            assert.equal(table, 'files');
            const builder = {
                update(payload) {
                    updatePayload = payload;
                    return builder;
                },
                eq() {
                    return builder;
                },
                select() {
                    return builder;
                },
                single() {
                    return Promise.resolve({
                        data: {
                            id: 'file-id',
                            filename: 'A.ifc',
                            uploaded_at: uploadedAt
                        },
                        error: null
                    });
                }
            };
            return builder;
        }
    };

    const service = createFilesService(supabase);
    const result = await service.updateFile('file-id', {
        size: 123,
        upload_date: uploadedAt
    });

    assert.equal(updatePayload.uploaded_at, uploadedAt);
    assert.ok(!Object.prototype.hasOwnProperty.call(updatePayload, 'upload_date'));
    assert.equal(result.upload_date, uploadedAt);
});
