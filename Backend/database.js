const fs = require('fs');
const path = require('path');

// JSON database file paths
const dbDir = path.join(__dirname, 'data');
const dbFiles = {
    users: path.join(dbDir, 'users.json'),
    projects: path.join(dbDir, 'projects.json'),
    files: path.join(dbDir, 'files.json'),
    qrCodes: path.join(dbDir, 'qr-codes.json'),
    activity: path.join(dbDir, 'activity.json')
};

// Ensure data directory exists
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize JSON files if they don't exist
function initDatabase() {
    Object.entries(dbFiles).forEach(([key, filepath]) => {
        if (!fs.existsSync(filepath)) {
            fs.writeFileSync(filepath, JSON.stringify([], null, 2));
            console.log(`✅ Created ${key}.json`);
        }
    });
    console.log('✅ Database initialized');
}

// Helper functions to read/write JSON
function readJSON(filepath) {
    try {
        const data = fs.readFileSync(filepath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading ${filepath}:`, error);
        return [];
    }
}

function writeJSON(filepath, data) {
    try {
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error(`Error writing ${filepath}:`, error);
        return false;
    }
}

// Initialize on first run
initDatabase();

// ==================== USERS ====================

function createUser(id, username, passwordHash, role = 'admin') {
    const users = readJSON(dbFiles.users);
    const newUser = {
        id,
        username,
        password_hash: passwordHash,
        role,
        created_at: new Date().toISOString()
    };
    users.push(newUser);
    writeJSON(dbFiles.users, users);
    return newUser;
}

function getAllUsers() {
    return readJSON(dbFiles.users).map(u => {
        const { password_hash, ...user } = u; // Exclude password hash
        return user;
    });
}

function deleteUser(id) {
    const users = readJSON(dbFiles.users);
    const filtered = users.filter(u => u.id !== id);

    if (users.length === filtered.length) return false;

    writeJSON(dbFiles.users, filtered);
    return true;
}

function getUserByUsername(username) {
    const users = readJSON(dbFiles.users);
    return users.find(u => u.username === username);
}

function getUserById(id) {
    const users = readJSON(dbFiles.users);
    return users.find(u => u.id === id);
}

// ==================== PROJECTS ====================

function createProject(id, name, description, status = 'active') {
    const projects = readJSON(dbFiles.projects);
    const newProject = {
        id,
        name,
        description,
        status,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    projects.push(newProject);
    writeJSON(dbFiles.projects, projects);
    return newProject;
}

function getAllProjects() {
    const projects = readJSON(dbFiles.projects);
    const files = readJSON(dbFiles.files);

    // Enrich projects with file stats
    return projects.map(project => {
        const projectFiles = files.filter(f => f.project_id === project.id);
        return {
            ...project,
            file_count: projectFiles.length,
            total_size: projectFiles.reduce((sum, f) => sum + (f.size || 0), 0)
        };
    }).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

function getProjectById(id) {
    const projects = readJSON(dbFiles.projects);
    return projects.find(p => p.id === id);
}

function updateProject(id, name, description, status) {
    const projects = readJSON(dbFiles.projects);
    const index = projects.findIndex(p => p.id === id);
    if (index !== -1) {
        projects[index] = {
            ...projects[index],
            name,
            description,
            status,
            updated_at: new Date().toISOString()
        };
        writeJSON(dbFiles.projects, projects);
        return projects[index];
    }
    return null;
}

function deleteProject(id) {
    const projects = readJSON(dbFiles.projects);
    const filtered = projects.filter(p => p.id !== id);
    writeJSON(dbFiles.projects, filtered);

    // Also delete associated files and QR codes
    const files = readJSON(dbFiles.files);
    const filteredFiles = files.filter(f => f.project_id !== id);
    writeJSON(dbFiles.files, filteredFiles);

    const qrCodes = readJSON(dbFiles.qrCodes);
    const filteredQR = qrCodes.filter(q => q.project_id !== id);
    writeJSON(dbFiles.qrCodes, filteredQR);

    return true;
}

// ==================== IFC FILES ====================

function createIFCFile(id, projectId, filename, filepath, size, metadata = null) {
    const files = readJSON(dbFiles.files);
    const newFile = {
        id,
        project_id: projectId,
        filename,
        filepath,
        size,
        metadata,
        upload_date: new Date().toISOString()
    };
    files.push(newFile);
    writeJSON(dbFiles.files, files);
    return newFile;
}

function getFilesByProject(projectId) {
    const files = readJSON(dbFiles.files);
    return files
        .filter(f => f.project_id === projectId)
        .sort((a, b) => new Date(b.upload_date) - new Date(a.upload_date));
}

function getFileById(id) {
    const files = readJSON(dbFiles.files);
    return files.find(f => f.id === id);
}

function deleteFile(id) {
    const files = readJSON(dbFiles.files);
    const file = files.find(f => f.id === id);

    if (file) {
        // Delete physical file
        if (fs.existsSync(file.filepath)) {
            fs.unlinkSync(file.filepath);
        }

        // Delete from database
        const filtered = files.filter(f => f.id !== id);
        writeJSON(dbFiles.files, filtered);

        // Delete associated QR codes
        const qrCodes = readJSON(dbFiles.qrCodes);
        const filteredQR = qrCodes.filter(q => q.file_id !== id);
        writeJSON(dbFiles.qrCodes, filteredQR);

        return true;
    }
    return false;
}

function getAllFiles() {
    const files = readJSON(dbFiles.files);
    const projects = readJSON(dbFiles.projects);

    return files.map(file => {
        const project = projects.find(p => p.id === file.project_id);
        return {
            ...file,
            project_name: project ? project.name : 'Unknown'
        };
    }).sort((a, b) => new Date(b.upload_date) - new Date(a.upload_date));
}

// ==================== QR CODES ====================

function createQRCode(id, projectId, fileId, elementId, qrCodeUrl, qrImagePath = null) {
    const qrCodes = readJSON(dbFiles.qrCodes);
    const newQR = {
        id,
        project_id: projectId,
        file_id: fileId,
        element_id: elementId,
        qr_code_url: qrCodeUrl,
        qr_image_path: qrImagePath,
        created_at: new Date().toISOString()
    };
    qrCodes.push(newQR);
    writeJSON(dbFiles.qrCodes, qrCodes);
    return newQR;
}

function getQRCodeById(id) {
    const qrCodes = readJSON(dbFiles.qrCodes);
    return qrCodes.find(q => q.id === id);
}

function getQRCodesByProject(projectId) {
    const qrCodes = readJSON(dbFiles.qrCodes);
    const files = readJSON(dbFiles.files);
    const projects = readJSON(dbFiles.projects);

    return qrCodes
        .filter(q => q.project_id === projectId)
        .map(qr => {
            const file = files.find(f => f.id === qr.file_id);
            const project = projects.find(p => p.id === qr.project_id);
            return {
                ...qr,
                filename: file ? file.filename : 'Unknown',
                project_name: project ? project.name : 'Unknown'
            };
        })
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function getAllQRCodes() {
    const qrCodes = readJSON(dbFiles.qrCodes);
    const files = readJSON(dbFiles.files);
    const projects = readJSON(dbFiles.projects);

    return qrCodes.map(qr => {
        const file = files.find(f => f.id === qr.file_id);
        const project = projects.find(p => p.id === qr.project_id);
        return {
            ...qr,
            filename: file ? file.filename : 'Unknown',
            project_name: project ? project.name : 'Unknown'
        };
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function deleteQRCode(id) {
    const qrCodes = readJSON(dbFiles.qrCodes);
    const qr = qrCodes.find(q => q.id === id);

    if (qr && qr.qr_image_path && fs.existsSync(qr.qr_image_path)) {
        fs.unlinkSync(qr.qr_image_path);
    }

    const filtered = qrCodes.filter(q => q.id !== id);
    writeJSON(dbFiles.qrCodes, filtered);
    return true;
}

// ==================== ACTIVITY LOG ====================

function logActivity(userId, action, details = null) {
    const activity = readJSON(dbFiles.activity);
    const newActivity = {
        id: activity.length + 1,
        user_id: userId,
        action,
        details,
        timestamp: new Date().toISOString()
    };
    activity.push(newActivity);

    // Keep only last 1000 entries
    if (activity.length > 1000) {
        activity.shift();
    }

    writeJSON(dbFiles.activity, activity);
    return newActivity;
}

function getRecentActivity(limit = 50) {
    const activity = readJSON(dbFiles.activity);
    const users = readJSON(dbFiles.users);

    return activity
        .slice(-limit)
        .reverse()
        .map(act => {
            const user = users.find(u => u.id === act.user_id);
            return {
                ...act,
                username: user ? user.username : 'Unknown'
            };
        });
}

// ==================== STATISTICS ====================

function getStatistics() {
    const projects = readJSON(dbFiles.projects);
    const files = readJSON(dbFiles.files);
    const qrCodes = readJSON(dbFiles.qrCodes);

    return {
        total_projects: projects.length,
        active_projects: projects.filter(p => p.status === 'active').length,
        total_files: files.length,
        total_storage: files.reduce((sum, f) => sum + (f.size || 0), 0),
        total_qr_codes: qrCodes.length
    };
}

// Export all functions
module.exports = {
    // Users
    createUser,
    getAllUsers,
    deleteUser,
    getUserByUsername,
    getUserById,
    // Projects
    createProject,
    getAllProjects,
    getProjectById,
    updateProject,
    deleteProject,
    // Files
    createIFCFile,
    getFilesByProject,
    getFileById,
    deleteFile,
    getAllFiles,
    // QR Codes
    createQRCode,
    getQRCodeById,
    getQRCodesByProject,
    getAllQRCodes,
    deleteQRCode,
    // Activity
    logActivity,
    getRecentActivity,
    // Statistics
    getStatistics
};
