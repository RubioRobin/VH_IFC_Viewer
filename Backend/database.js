const fs = require('fs');
const path = require('path');

// JSON database file paths - using __dirname for relative stability
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
            fs.writeFileSync(filepath, JSON.stringify([], null, 2));
            console.log(`✅ Created empty ${key}.json`);
        }
    });
    console.log('✅ Database check complete');
}

// Helper functions (remain same as before)
function readJSON(filepath) {
    try {
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
    // Projects
    getAllProjects: () => readJSON(dbFiles.projects),
    getProjectById: (id) => readJSON(dbFiles.projects).find(p => p.id === id),
    createProject: (id, name, description) => {
        const projects = readJSON(dbFiles.projects);
        const newProject = { id, name, description, created_at: new Date().toISOString() };
        projects.push(newProject);
        writeJSON(dbFiles.projects, projects);
        return newProject;
    },
    // Files
    getAllFiles: () => readJSON(dbFiles.files),
    getFileById: (id) => readJSON(dbFiles.files).find(f => f.id === id),
    createFile: (id, projectId, filename, realname, size, type) => {
        const files = readJSON(dbFiles.files);
        const newFile = { id, project_id: projectId, filename, originalname: realname, size, type, upload_date: new Date().toISOString() };
        files.push(newFile);
        writeJSON(dbFiles.files, files);
        return newFile;
    },
    // QR
    getAllQRCodes: () => readJSON(dbFiles.qrCodes),
    createQRCode: (id, projectId, fileId, elementId, url) => {
        const qrs = readJSON(dbFiles.qrCodes);
        const newQR = { id, project_id: projectId, file_id: fileId, element_id: elementId, qr_image_url: url, created_at: new Date().toISOString() };
        qrs.push(newQR);
        writeJSON(dbFiles.qrCodes, qrs);
        return newQR;
    },
    // Users
    getUserByUsername: (username) => readJSON(dbFiles.users).find(u => u.username === username),
    createUser: (id, username, passwordHash, role) => {
        const users = readJSON(dbFiles.users);
        const newUser = { id, username, password_hash: passwordHash, role, created_at: new Date().toISOString() };
        users.push(newUser);
        writeJSON(dbFiles.users, users);
        return newUser;
    }
};
