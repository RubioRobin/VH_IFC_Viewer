const assert = require('node:assert/strict');
const test = require('node:test');

const { buildRevitExportStoragePath } = require('../services/storage-paths');

test('buildRevitExportStoragePath returns a stable project and filename based path', () => {
    const first = buildRevitExportStoragePath({
        projectId: 'project 01',
        modelId: '4ba0578e-d3a8-4e33-b4a0-6f81bfcb7a52',
        fileName: 'GP5-02 Balkon links.ifc'
    });
    const second = buildRevitExportStoragePath({
        projectId: 'project 01',
        modelId: '4ba0578e-d3a8-4e33-b4a0-6f81bfcb7a52',
        fileName: 'GP5-02 Balkon links.ifc'
    });

    assert.equal(first, second);
    assert.equal(first, 'revit_exports/project_01/4ba0578e-d3a8-4e33-b4a0-6f81bfcb7a52/GP5-02_Balkon_links.ifc');
});

test('buildRevitExportStoragePath removes path traversal and unsafe characters', () => {
    const path = buildRevitExportStoragePath({
        projectId: '../VH Project',
        modelId: 'model/with/slashes',
        fileName: '../bad name @!.ifc'
    });

    assert.equal(path, 'revit_exports/VH_Project/model_with_slashes/bad_name.ifc');
});
