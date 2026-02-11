const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
    try {
        supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log('✅ Supabase client initialized');
    } catch (e) {
        console.error('❌ Supabase init failed:', e);
    }
} else {
    // Only error if in production or trying to connect
    if (process.env.NODE_ENV === 'production') console.error('❌ Supabase URL or Key missing!');
}

// --- INIT ---
async function initDatabase() {
    if (!supabase) return;
    console.log('--- Checking Supabase Admin ---');

    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', 'admin')
            .single();

        // If error implies no rows (PGRST116), handle creation. 
        // Note: single() returns error if 0 or >1 rows.

        if (!user) {
            console.log('Creating admin user...');
            await supabase.from('users').insert([{
                id: 'admin-1',
                username: 'admin',
                password_hash: bcrypt.hashSync('admin123', 10),
                role: 'admin'
            }]);
            console.log('✅ Admin user created');
        } else {
            console.log('✅ Admin user matches found');
            // FIX: Check for truncated hash or bad seed
            if (!user.password_hash || user.password_hash.length < 50) {
                console.log('⚠️  Admin password hash appears invalid/truncated. Fixing...');
                const newHash = bcrypt.hashSync('admin123', 10);
                await supabase.from('users').update({ password_hash: newHash }).eq('id', user.id);
                console.log('✅ Admin password hash auto-repaired.');
            }
        }
    } catch (e) {
        // If error code is 'PGRST116' (JSON object), it means 0 rows.
        if (e.code === 'PGRST116') {
            console.log('Creating admin user (catch block)...');
            await supabase.from('users').insert([{
                id: 'admin-1',
                username: 'admin',
                password_hash: bcrypt.hashSync('admin123', 10),
                role: 'admin'
            }]);
            console.log('✅ Admin user created');
        } else {
            console.error('Database init error:', e.message || e);
        }
    }
}

// --- USERS ---
async function getUserByUsername(username) {
    if (!supabase) {
        console.log('QUERY ERROR: Supabase client not initialized');
        return null;
    }
    const { data, error } = await supabase.from('users').select('*').eq('username', username).single();
    if (error) {
        console.error('QUERY ERROR getUserByUsername:', error);
        return null;
    }
    if (!data) {
        console.log('QUERY RESULT: User not found for', username);
    }
    return data;
}

async function getAllUsers() {
    if (!supabase) return [];
    // Select only safe fields
    const { data, error } = await supabase
        .from('users')
        .select('id, username, role, created_at')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('getAllUsers error:', error);
        return [];
    }
    return data || [];
}

async function createUser(username, password, role = 'user') {
    if (!supabase) throw new Error('Database not initialized');

    // Hash the password
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the new user
    const { data, error } = await supabase
        .from('users')
        .insert([{ username, password: hashedPassword, role }])
        .select('id, username, role, created_at')
        .single();

    if (error) {
        console.error('createUser error:', error);
        throw new Error(error.message || 'Failed to create user');
    }

    return data;
}

async function deleteUser(id) {
    if (!supabase) return;
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) throw error;
}

// --- PROJECTS ---
// Matches server.js: db.getAllProjects()
async function getAllProjects() {
    if (!supabase) return [];
    try {
        const { data, error } = await supabase
            .from('projects')
            .select(`*, files (*)`)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return data.map(p => ({
            ...p,
            files: (p.files || []).map(mapFile),
            file_count: (p.files || []).length,
            total_size: (p.files || []).reduce((acc, f) => acc + (f.size || 0), 0)
        }));
    } catch (e) {
        console.error('getProjects error:', e);
        return [];
    }
}

// Helper to map DB columns to App fields
function mapFile(f) {
    if (!f) return null;
    return {
        ...f,
        filename: f.filename || f.original_name,
        upload_date: f.upload_date || f.created_at
    };
}

// Matches server.js: db.getProjectById(id)
async function getProjectById(id) {
    if (!supabase) return null;
    try {
        const { data, error } = await supabase
            .from('projects')
            .select(`*, files (*)`)
            .eq('id', id)
            .single();

        if (error) return null;
        return {
            ...data,
            files: (data.files || []).map(mapFile)
        };
    } catch (e) { return null; }
}

// Matches server.js: db.createProject(uuid, name, description, status)
// Note: server.js provides UUID, we can use it or ignore it. Let's use it for consistency.
async function createProject(id, name, description, status) {
    if (!supabase) return null;
    const newProject = {
        id: id || uuidv4(),
        name,
        description,
        status: status || 'actief'
    };

    const { data, error } = await supabase
        .from('projects')
        .insert([newProject])
        .select()
        .single();

    if (error) throw error;

    await logActivity(newProject.id, 'Admin', 'create_project', `Project "${name}" created`);

    return { ...data, files: [] };
}

async function updateProjectStatus(projectId, status) {
    if (!supabase) return null;

    const { data, error } = await supabase
        .from('projects')
        .update({ status })
        .eq('id', projectId)
        .select()
        .single();

    if (error) throw error;

    await logActivity(projectId, 'Admin', 'update_project_status', `Status changed to "${status}"`);

    return data;
}

// Matches server.js: db.updateProject(id, body)
async function updateProject(id, updates) {
    if (!supabase) return null;
    // Filter updates to allowed fields to avoid schema errors
    const safeUpdates = {};
    if (updates.name) safeUpdates.name = updates.name;
    if (updates.description) safeUpdates.description = updates.description;

    const { data, error } = await supabase
        .from('projects')
        .update(safeUpdates)
        .eq('id', id)
        .select()
        .single();

    if (error) return null;
    return data;
}

// Matches server.js: db.deleteProject(id)
async function deleteProject(id) {
    if (!supabase) return;
    await supabase.from('projects').delete().eq('id', id);
}

// --- FILES ---
// Matches server.js: db.getFilesByProjectId(id)
async function getFilesByProjectId(projectId) {
    if (!supabase) return [];
    const { data } = await supabase.from('files').select('*').eq('project_id', projectId);
    return (data || []).map(mapFile);
}

// Matches server.js: db.getAllFiles() -> Was exported as null/empty in old code?
// Used in server.js: app.get('/api/files', ...)
async function getAllFiles() {
    if (!supabase) return [];
    const { data } = await supabase.from('files').select('*');
    return (data || []).map(mapFile);
}

// Matches server.js: db.getFileById(id) -> Used for deletion
async function getFileById(id) {
    if (!supabase) return null;
    const { data, error } = await supabase.from('files').select('*').eq('id', id).single();
    if (error) return null;
    return mapFile(data);
}

// --- STORAGE ---
// Helper to read file from disk
const fs = require('fs');
const path = require('path');



async function getFileDownloadUrl(storagePath) {
    if (!supabase) return null;

    // Use Signed URL for private bucket access (15 minutes expiry)
    // This allows the frontend to download the file securely without a permanent public link.
    const { data, error } = await supabase.storage
        .from('ifc-private')
        .createSignedUrl(storagePath, 60 * 15); // 15 mins

    if (error) {
        console.error('Error generating signed URL:', error);
        return null;
    }
    return data.signedUrl;
}

// Generate Signed Upload URL (PUT)
async function createSignedUploadUrl(storagePath) {
    if (!supabase) return null;
    try {
        const { data, error } = await supabase.storage
            .from('ifc-private')
            .createSignedUploadUrl(storagePath);

        if (error) throw error;
        return data; // { signedUrl, token, path }
    } catch (e) {
        console.error('Error creating upload URL:', e);
        return null;
    }
}



// Matches server.js: db.deleteFile(id)
async function deleteFile(id) {
    if (!supabase) return;

    // 1. Get file path from DB
    const file = await getFileById(id);
    if (!file) return;

    // 2. Delete from Storage
    if (file.path) {
        const { error } = await supabase.storage.from('ifc-private').remove([file.path]);
        if (error) console.error('Storage Delete Error:', error);
        else console.log('File deleted from storage:', file.path);
    }

    // 3. Delete from DB
    await supabase.from('files').delete().eq('id', id);
}

// Matches server.js: db.createFile(id, projectId, filename, path, size)
async function createFile(id, projectId, filename, path, size) {
    if (!supabase) return null;

    // Defensive check: Ensure we have a valid name
    const finalName = filename || 'unnamed_file_' + Date.now();

    const newFile = {
        id: id || uuidv4(),
        project_id: projectId,
        filename: finalName,       // Provide both columns
        original_name: finalName,  // to satisfy NOT NULL constraints
        path: path,
        size: size
    };

    const { data, error } = await supabase.from('files').insert([newFile]).select().single();

    if (error) {
        console.error('createFile Error:', error);
        throw error;
    }

    await logActivity(projectId, 'Admin', 'upload_file', `File "${filename}" uploaded`);
    return mapFile(data);
}

async function updateFile(id, updates) {
    if (!supabase) return null;

    // Clean updates from non-existent columns based on schema audit
    const cleanUpdates = { ...updates };
    delete cleanUpdates.upload_date;

    // If filename is provided, sync it with original_name for dual-column tables
    if (cleanUpdates.filename) {
        cleanUpdates.original_name = cleanUpdates.filename;
    } else if (cleanUpdates.original_name) {
        cleanUpdates.filename = cleanUpdates.original_name;
    }

    const { data, error } = await supabase
        .from('files')
        .update(cleanUpdates)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('updateFile Error:', error);
        return null;
    }
    return mapFile(data);
}

// --- QR CODES ---
// Matches server.js: db.getAllQRCodes()
async function getAllQRCodes() {
    if (!supabase) return [];
    const { data } = await supabase.from('qr_codes').select('*');
    return data || [];
}

// Matches server.js: db.createQRCode(id, projectId, fileId, elementId, path)
async function createQRCode(id, projectId, fileId, elementId, path) {
    if (!supabase) return null;
    const newQR = {
        id: id || uuidv4(),
        project_id: projectId,
        file_id: fileId,
        element_id: elementId,
        path: path
    };

    const { data, error } = await supabase.from('qr_codes').insert([newQR]).select().single();
    if (error) throw error;
    return data;
}

// Matches server.js: db.deleteQRCode(id)
async function deleteQRCode(id) {
    if (!supabase) return;
    await supabase.from('qr_codes').delete().eq('id', id);
}

// --- ACTIVITY & STATS ---
// Matches server.js: db.logActivity(userId, username, type, details)
// Note: server.js params: user?.id, user?.username, 'upload', details
// Database schema: project_id, type, user, details.
// Mismatch! server.js passes (userId, username, type, details).
// My previous implementation: (projectId, type, user, details).
// I should adjust to match server.js usage OR change server.js.
// Since server.js doesn't always have projectId in context for logActivity (e.g. login?),
// let's look at server.js usage:
// logActivity(user?.id, user?.username, 'upload', ...) -> userId, username
// But my schema has `project_id`.
// I'll make projectId optional in schema (it is References projects(id)).
// I'll update logic to accept the params server.js sends.

async function logActivity(projectId, user, type, details) {
    if (!supabase) return;

    const logEntry = {
        project_id: projectId, // Can be null
        user_name: user || 'System',
        type: type || 'info',
        details: details || '',
        timestamp: new Date().toISOString()
    };

    const { error } = await supabase.from('activity').insert([logEntry]);
    if (error) console.error('Activity Log Error:', error);
}

// Matches server.js: db.getRecentActivity(limit)
async function getRecentActivity(limit = 20) {
    if (!supabase) return [];
    const { data } = await supabase
        .from('activity')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);
    return data || [];
}

// Matches server.js: db.getStatistics() (Dashboard)
async function getStatistics() {
    if (!supabase) return {
        total_projects: 0,
        active_projects: 0,
        total_files: 0,
        total_storage: 0,
        total_qr_codes: 0
    };

    // Get total projects count
    const { count: totalProjects } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true });

    // Get active projects count
    const { count: activeProjects } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'actief');

    // Get total files count
    const { count: totalFiles } = await supabase
        .from('files')
        .select('*', { count: 'exact', head: true });

    // Get total storage (sum of all file sizes)
    const { data: filesData } = await supabase
        .from('files')
        .select('size');
    const totalStorage = filesData?.reduce((sum, file) => sum + (file.size || 0), 0) || 0;

    // Get QR code usage count (count of public_links which represent QR code scans)
    const { count: qrCodeUsage } = await supabase
        .from('public_links')
        .select('*', { count: 'exact', head: true });

    return {
        total_projects: totalProjects || 0,
        active_projects: activeProjects || 0,
        total_files: totalFiles || 0,
        total_storage: totalStorage,
        total_qr_codes: qrCodeUsage || 0
    };
}

// --- PUBLIC LINKS ---
async function createPublicLink(projectId, fileId) {
    if (!supabase) return null;

    // Check if active link exists? Optional. Let's create new one.
    const newLink = {
        public_id: uuidv4(),
        project_id: projectId,
        ifc_file_id: fileId,
        is_active: true
    };

    const { data, error } = await supabase.from('public_links').insert([newLink]).select().single();
    if (error) throw error;

    await logActivity(projectId, 'Admin', 'create_link', `Public link created for file ${fileId}`);
    return data;
}

async function getPublicLink(publicId) {
    if (!supabase) return null;
    const { data, error } = await supabase
        .from('public_links')
        .select(`*, files (*)`) // Fetch nested file info
        .eq('public_id', publicId)
        .eq('is_active', true)
        .single();

    if (error) return null;
    return data;
}

// --- MODELS & REVISIONS (New Architecture) ---
async function getModelsByProjectId(projectId) {
    if (!supabase) return [];
    try {
        const { data, error } = await supabase
            .from('models')
            .select(`*, model_versions (*)`)
            .eq('project_id', projectId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    } catch (e) {
        console.error('getModelsByProjectId error:', e);
        return [];
    }
}

async function uploadRevisionFile(revisionId, fileData) {
    if (!supabase) return null;
    // This is a simplified version of the upload flow for manual revision attachment
    // In production, we'd use signed URLs, but for this specific "Revision Upload" button
    // we'll implement it as requested by the frontend.
    const { data, error } = await supabase
        .from('revisions')
        .update({
            status: 'ready',
            file_name: fileData.filename,
            file_size: fileData.size,
            // path mapping etc.
        })
        .eq('id', revisionId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

module.exports = {
    supabase,
    initDatabase,
    getUserByUsername,
    getAllUsers,
    deleteUser,
    getAllProjects,     // server.js calls this
    getProjects: getAllProjects, // Alias just in case
    createProject,
    getProjectById,
    updateProject,
    updateProjectStatus,
    deleteProject,

    getFilesByProjectId,
    getAllFiles,

    getFileById,
    createFile,
    updateFile,
    deleteFile,

    getAllQRCodes,
    createQRCode,
    deleteQRCode,

    // New Public Link Methods
    createPublicLink,
    getPublicLink,

    getModelsByProjectId,
    uploadRevisionFile,

    logActivity,
    getRecentActivity,
    getStatistics,
    getStatistics,
    getStatistics,
    getFileDownloadUrl, // Exported for server.js to redirect downloads
    createSignedUploadUrl,

    // NEW Revit Workflow Methods
    createModel: async (projectId, name, createdBy = 'plugin') => {
        if (!supabase) return null;

        // 1. Try to find existing model by name in this project
        const { data: existing } = await supabase
            .from('models')
            .select('id')
            .eq('project_id', projectId)
            .eq('name', name)
            .maybeSingle();

        if (existing) return existing;

        // 2. Create if not exists
        const { data, error } = await supabase
            .from('models')
            .insert([{ project_id: projectId, name, created_by: createdBy }])
            .select()
            .single();

        if (error) throw error;
        return data;
    },
    createModelVersion: async (modelId, storagePath, size, checksum) => {
        if (!supabase) return null;
        const { data, error } = await supabase.from('model_versions').insert([{ model_id: modelId, storage_path_ifc: storagePath, file_size: size, checksum_sha256: checksum }]).select().single();
        if (error) throw error;
        return data;
    },
    createShare: async (versionId, token) => {
        if (!supabase) return null;
        const { data, error } = await supabase.from('shares').insert([{ model_version_id: versionId, token }]).select().single();
        if (error) throw error;
        return data;
    },
    getShareByToken: async (token) => {
        if (!supabase) return null;
        const { data, error } = await supabase.from('shares').select('*, model_versions(*, models(*, projects(*)))').eq('token', token).eq('is_active', true).single();
        if (error) return null;
        return data;
    },
    createQRAsset: async (projectId, versionId, storagePath) => {
        if (!supabase) return null;
        const { data, error } = await supabase.from('qr_assets').insert([{ project_id: projectId, model_version_id: versionId, storage_path_png: storagePath }]).select().single();
        if (error) throw error;
        return data;
    },
    getQRAssetByVersion: async (versionId) => {
        if (!supabase) return null;
        const { data, error } = await supabase.from('qr_assets').select('*').eq('model_version_id', versionId).single();
        if (error) return null;
        return data;
    },
    linkSheet: async (versionId, sheetId, viewId, placementInfo) => {
        if (!supabase) return null;
        const { data, error } = await supabase.from('sheets_link').insert([{ model_version_id: versionId, revit_sheet_unique_id: sheetId, revit_view_unique_id: viewId, placement_info_json: placementInfo }]).select().single();
        if (error) throw error;
        return data;
    },

    // User management
    getAllUsers,
    createUser,
    deleteUser
};
