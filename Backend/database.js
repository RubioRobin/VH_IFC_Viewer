const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Check environment variables at startup
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('✅ Supabase client initialized');
} else {
    console.error('❌ Supabase URL or Key missing!');
}

async function initDatabase() {
    console.log('--- Initializing Database (Supabase) ---');
    if (!supabase) return;

    // Check if admin exists
    const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', 'admin');

    if (error) {
        console.error('❌ Failed to check admin user:', error);
        return;
    }

    if (!users || users.length === 0) {
        console.log('⚠️ Admin user not found, creating...');
        const passwordHash = bcrypt.hashSync('admin123', 10);
        const { error: insertError } = await supabase
            .from('users')
            .insert([{
                id: 'admin-1',
                username: 'admin',
                password_hash: passwordHash,
                role: 'admin'
            }]);

        if (insertError) console.error('❌ Failed to create admin:', insertError);
        else console.log('✅ Admin user created');
    } else {
        console.log('✅ Admin user exists');
    }
}

// WRAPPER: Get User
async function getUserByUsername(username) {
    if (!supabase) return null;
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

    if (error) {
        console.error('Login fetch error:', error);
        return null;
    }
    return data;
}

// WRAPPER: Get Projects
async function getProjects() {
    if (!supabase) return [];
    const { data, error } = await supabase
        .from('projects')
        .select(`
            *,
            files (*)
        `)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Get projects error:', error);
        return [];
    }

    // Transform to match old JSON structure expected by frontend
    return data.map(p => ({
        ...p,
        files: p.files || []
    }));
}

// WRAPPER: Create Project
async function createProject(name, description) {
    if (!supabase) return null;
    const newProject = {
        id: uuidv4(),
        name,
        description
    };

    const { data, error } = await supabase
        .from('projects')
        .insert([newProject])
        .select()
        .single();

    if (error) {
        console.error('Create project error:', error);
        throw error;
    }

    // Log activity
    await logActivity(newProject.id, 'create_project', 'Admin', `Project "${name}" created`);

    return { ...data, files: [] };
}

// WRAPPER: Get Project by ID
async function getProjectById(id) {
    if (!supabase) return null;
    const { data, error } = await supabase
        .from('projects')
        .select(`
            *,
            files (*)
        `)
        .eq('id', id)
        .single();

    if (error) return null;
    return data;
}

// WRAPPER: Upload File Metadata
async function saveFileMetadata(fileData) {
    if (!supabase) return null;

    // fileData comes from server.js: id, projectId, filename, originalName, path, size, type, createdAt
    const dbFile = {
        id: fileData.id,
        project_id: fileData.projectId,
        filename: fileData.filename,
        original_name: fileData.originalName,
        path: fileData.path,
        size: fileData.size,
        type: fileData.type,
        uploaded_at: fileData.createdAt
    };

    const { error } = await supabase
        .from('files')
        .insert([dbFile]);

    if (error) {
        console.error('Save file error:', error);
        throw error;
    }

    await logActivity(
        fileData.projectId,
        'upload_file',
        'Admin',
        `File "${fileData.originalName}" uploaded`
    );

    return fileData;
}

// WRAPPER: Get files
async function getFiles(projectId) {
    if (!supabase) return [];
    const { data } = await supabase
        .from('files')
        .select('*')
        .eq('project_id', projectId);
    return data || [];
}

// WRAPPER: Activity
async function getProjectActivity(projectId) {
    if (!supabase) return [];
    const { data } = await supabase
        .from('activity')
        .select('*')
        .eq('project_id', projectId)
        .order('timestamp', { ascending: false });
    return data || [];
}

async function logActivity(projectId, type, user, details) {
    if (!supabase) return;
    await supabase.from('activity').insert([{
        project_id: projectId,
        type,
        user,
        details
    }]);
}

// WRAPPER: Delete Project
async function deleteProject(id) {
    if (!supabase) return;
    await supabase.from('projects').delete().eq('id', id);
}

// WRAPPER: Delete File
async function deleteFile(id) {
    if (!supabase) return;
    await supabase.from('files').delete().eq('id', id);
}

module.exports = {
    initDatabase,
    getUserByUsername,
    getProjects,
    createProject,
    getProjectById,
    saveFileMetadata,
    getFiles,
    getProjectActivity,
    logActivity,
    deleteProject,
    deleteFile
};
