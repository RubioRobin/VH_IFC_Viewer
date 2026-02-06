const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

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

function initDatabase() {
    console.log('--- Initializing Database ---');
    Object.entries(dbFiles).forEach(([key, filepath]) => {
        if (!fs.existsSync(filepath)) {
            let initialData = [];
            if (key === 'users') {
                initialData = [{
                    id: 'admin-1',
                    username: 'admin',
                    password_hash: bcrypt.hashSync('admin123', 10),
                    role: 'admin',
                    created_at: new Date().toISOString()
                }];
            }
            fs.writeFileSync(filepath, JSON.stringify(initialData, null, 2));
            console.log(`✅ Created ${key}.json`);
        }
    });
    console.log('✅ Database check complete');
}

function readJSON(filepath) {
    try {
        if (!fs.existsSync(filepath)) return [];
        const data = fs.readFileSync(filepath, 'utf8');
        return JSON.parse(data);
    } catch (e) { return []; }
}

function writeJSON(filepath, data) {
    try {
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        return true;
    } catch (e) { return false; }
}

module.exports = {
    initDatabase,
    getAllProjects: () => readJSON(dbFiles.projects),
    getProjectById: (id) => readJSON(dbFiles.projects).find(p => p.id === id),
    createProject: (id, name, description) => {
        const projects = readJSON(dbFiles.projects);
        const newProject = { id, name, description, created_at: new Date().toISOString() };
        projects.push(newProject);
        writeJSON(dbFiles.projects, projects);
        return newProject;
    },
    getAllFiles: () => readJSON(dbFiles.files),
    getFileById: (id) => readJSON(dbFiles.files).find(f => f.id === id),
    createFile: (id, projectId, filename, realname, size, type) => {
        const files = readJSON(dbFiles.files);
        const newFile = { id, project_id: projectId, filename, originalname: realname, size, type, upload_date: new Date().toISOString() };
        files.push(newFile);
        writeJSON(dbFiles.files, files);
        return newFile;
    },
    getAllQRCodes: () => readJSON(dbFiles.qrCodes),
    createQRCode: (id, projectId, fileId, elementId, url) => {
        const qrs = readJSON(dbFiles.qrCodes);
        const newQR = { id, project_id: projectId, file_id: fileId, element_id: elementId, qr_image_url: url, created_at: new Date().toISOString() };
        qrs.push(newQR);
        writeJSON(dbFiles.qrCodes, qrs);
        return newQR;
    },
    deleteProject: (id) => {
        let projects = readJSON(dbFiles.projects);
        projects = projects.filter(p => p.id !== id);
        writeJSON(dbFiles.projects, projects);
    },
    updateProject: (id, updates) => {
        const projects = readJSON(dbFiles.projects);
        const index = projects.findIndex(p => p.id === id);
        if (index !== -1) {
            projects[index] = { ...projects[index], ...updates, updated_at: new Date().toISOString() };
            writeJSON(dbFiles.projects, projects);
            return projects[index];
        }
        return null;
    },
    deleteFile: (id) => {
        let files = readJSON(dbFiles.files);
        files = files.filter(f => f.id !== id);
        writeJSON(dbFiles.files, files);
    },
    deleteQRCode: (id) => {
        let qrs = readJSON(dbFiles.qrCodes);
        qrs = qrs.filter(q => q.id !== id);
        writeJSON(dbFiles.qrCodes, qrs);
    },
    getFilesByProjectId: (projectId) => readJSON(dbFiles.files).filter(f => f.project_id === projectId),
    getStatistics: () => {
        const projects = readJSON(dbFiles.projects);
        const files = readJSON(dbFiles.files);
        const qrs = readJSON(dbFiles.qrCodes);
        return {
            total_projects: projects.length,
            active_projects: projects.filter(p => p.status === 'active').length,
            total_files: files.length,
            total_storage: files.reduce((acc, f) => acc + (f.size || 0), 0),
            total_qr_codes: qrs.length
        };
    },
    logActivity: (userId, username, action, details) => {
        const activities = readJSON(dbFiles.activity);
        const newActivity = {
            id: uuidv4(),
            user_id: userId,
            username: username,
            action: action,
            details: details,
            timestamp: new Date().toISOString()
        };
        activities.unshift(newActivity); // Add to beginning
        if (activities.length > 100) activities.pop(); // Limit to 100
        writeJSON(dbFiles.activity, activities);
        return newActivity;
    },
    getRecentActivity: (limit = 20) => readJSON(dbFiles.activity).slice(0, limit),
    getUserByUsername: (username) => readJSON(dbFiles.users).find(u => u.username === username),
    createUser: (id, username, passwordHash, role) => {
        const users = readJSON(dbFiles.users);
        const newUser = { id, username, password_hash: passwordHash, role, created_at: new Date().toISOString() };
        users.push(newUser);
        writeJSON(dbFiles.users, users);
        return newUser;
    }
};
