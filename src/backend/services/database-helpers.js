/**
 * Database Helper Functions for Signed Upload Flow
 * 
 * Functions for models, revisions, and shares tables.
 */

const { supabaseAdmin } = require('./supabase-admin');
const { v4: uuidv4 } = require('uuid');

// ============================================================================
// MODELS
// ============================================================================

/**
 * Create a new model
 * @param {string} projectId - Project ID
 * @param {string} name - Model name
 * @param {string} description - Optional description
 * @returns {Promise<object>} Created model
 */
async function createModel(projectId, name, description = null) {
    const newModel = {
        id: uuidv4(),
        project_id: projectId,
        name,
        description
    };

    const { data, error } = await supabaseAdmin
        .from('models')
        .insert([newModel])
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Get model by ID
 * @param {string} modelId 
 * @returns {Promise<object|null>}
 */
async function getModelById(modelId) {
    const { data, error } = await supabaseAdmin
        .from('models')
        .select('*')
        .eq('id', modelId)
        .single();

    if (error) return null;
    return data;
}

/**
 * Get or create model by project ID and name
 * @param {string} projectId 
 * @param {string} modelName 
 * @returns {Promise<object>}
 */
async function getOrCreateModel(projectId, modelName) {
    // Try to find existing model
    const { data: existing } = await supabaseAdmin
        .from('models')
        .select('*')
        .eq('project_id', projectId)
        .eq('name', modelName)
        .single();

    if (existing) return existing;

    // Create new model
    return await createModel(projectId, modelName);
}

// ============================================================================
// REVISIONS
// ============================================================================

/**
 * Create a new revision
 * @param {object} data - Revision data
 * @returns {Promise<object>} Created revision
 */
async function createRevision(data) {
    const newRevision = {
        id: uuidv4(),
        model_id: data.modelId,
        status: 'pending',
        storage_path: data.storagePath,
        file_name: data.fileName,
        file_size: data.fileSize || null,
        sha256: data.sha256 || null,
        revit_doc_guid: data.revitDocGuid || null,
        revit_view_id: data.revitViewId || null,
        element_ids: data.elementIds || null
    };

    const { data: created, error } = await supabaseAdmin
        .from('revisions')
        .insert([newRevision])
        .select()
        .single();

    if (error) throw error;
    return created;
}

/**
 * Update revision status
 * @param {string} revisionId 
 * @param {string} status - 'pending', 'uploaded', 'processing', 'ready', 'failed'
 * @returns {Promise<object>}
 */
async function updateRevisionStatus(revisionId, status) {
    const updates = { status };

    if (status === 'uploaded') {
        updates.uploaded_at = new Date().toISOString();
    } else if (status === 'ready') {
        updates.completed_at = new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin
        .from('revisions')
        .update(updates)
        .eq('id', revisionId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Get revision by ID
 * @param {string} revisionId 
 * @returns {Promise<object|null>}
 */
async function getRevisionById(revisionId) {
    const { data, error } = await supabaseAdmin
        .from('revisions')
        .select(`
            *,
            model:models (
                *,
                project:projects (*)
            )
        `)
        .eq('id', revisionId)
        .single();

    if (error) return null;
    return data;
}

/**
 * Check for duplicate revision by SHA256
 * @param {string} modelId 
 * @param {string} sha256 
 * @returns {Promise<object|null>}
 */
async function findRevisionBySha256(modelId, sha256) {
    if (!sha256) return null;

    const { data } = await supabaseAdmin
        .from('revisions')
        .select('*')
        .eq('model_id', modelId)
        .eq('sha256', sha256)
        .eq('status', 'ready')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    return data || null;
}

// ============================================================================
// SHARES
// ============================================================================

/**
 * Create a new share
 * @param {object} data - Share data
 * @returns {Promise<object>} Created share
 */
async function createShare(data) {
    const newShare = {
        id: uuidv4(),
        revision_id: data.revisionId,
        share_id: data.shareId,
        view_state: data.viewState || null,
        qr_storage_path: data.qrStoragePath || null,
        expires_at: data.expiresAt || null
    };

    const { data: created, error } = await supabaseAdmin
        .from('shares')
        .insert([newShare])
        .select()
        .single();

    if (error) throw error;
    return created;
}

/**
 * Get share by share_id (for public viewer)
 * @param {string} shareId 
 * @returns {Promise<object|null>}
 */
async function getShareByShareId(shareId) {
    const { data, error } = await supabaseAdmin
        .from('shares')
        .select(`
            *,
            revision:revisions (
                *,
                model:models (
                    *,
                    project:projects (*)
                )
            )
        `)
        .eq('share_id', shareId)
        .single();

    if (error) return null;

    // Update last_accessed_at
    await supabaseAdmin
        .from('shares')
        .update({ last_accessed_at: new Date().toISOString() })
        .eq('share_id', shareId);

    return data;
}

/**
 * Get share by revision ID
 * @param {string} revisionId 
 * @returns {Promise<object|null>}
 */
async function getShareByRevisionId(revisionId) {
    const { data, error } = await supabaseAdmin
        .from('shares')
        .select('*')
        .eq('revision_id', revisionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (error) return null;
    return data;
}

module.exports = {
    // Models
    createModel,
    getModelById,
    getOrCreateModel,

    // Revisions
    createRevision,
    updateRevisionStatus,
    getRevisionById,
    findRevisionBySha256,

    // Shares
    createShare,
    getShareByShareId,
    getShareByRevisionId
};
