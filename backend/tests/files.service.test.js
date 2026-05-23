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
    const updated = { ...existing, path: 'new/path/A.ifc', size: 42, original_name: 'A.ifc' };

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
    const result = await service.createFile(null, 'project-id', 'A.ifc', 'new/path/A.ifc', 42, 'Tester');

    assert.equal(result.id, 'existing-file-id');
    assert.equal(result.path, 'new/path/A.ifc');
    assert.ok(calls.some(call => Array.isArray(call) && call[0] === 'update'));
    assert.ok(!calls.some(call => Array.isArray(call) && call[0] === 'insert'));
});
