function sanitizeStorageSegment(value, fallback, options = {}) {
    const rawValue = String(value || fallback || 'unknown').replace(/\\/g, '/');
    const source = options.basename
        ? rawValue.split('/').filter(Boolean).pop() || fallback || 'unknown'
        : rawValue.replace(/\//g, '_');

    const sanitized = source
        .trim()
        .replace(/\.[.]+/g, '')
        .replace(/[^a-zA-Z0-9.\-_]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/_+\./g, '.')
        .replace(/^[._-]+|[._-]+$/g, '');

    return sanitized || fallback || 'unknown';
}

function buildRevitExportStoragePath({ projectId, modelId, fileName }) {
    const safeProjectId = sanitizeStorageSegment(projectId, 'project');
    const safeModelId = sanitizeStorageSegment(modelId, 'model');
    const safeFileName = sanitizeStorageSegment(fileName, 'model.ifc', { basename: true });

    return `revit_exports/${safeProjectId}/${safeModelId}/${safeFileName}`;
}

module.exports = {
    buildRevitExportStoragePath,
    sanitizeStorageSegment
};
