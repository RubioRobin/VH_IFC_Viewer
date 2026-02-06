const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3001;
const frontendUrl = process.env.FRONTEND_URL || '*';

// --- CONFIG & HEALTH (Immediate) ---
app.set('trust proxy', 1);

console.log('--- CORS Configuration ---');
console.log('FRONTEND_URL:', frontendUrl);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('Allowed origins:', frontendUrl === '*' ? 'ALL (*)' : [frontendUrl, 'http://localhost:5173', 'http://localhost:5174']);
console.log('-------------------------');

app.get('/', (req, res) => {
    console.log(`[LOG] Root hit at ${new Date().toISOString()}`);
    res.send('VH IFC Viewer Backend is ONLINE! 🚀');
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- MIDDLEWARE ---
app.use(cors({
    origin: frontendUrl === '*' ? true : [frontendUrl, 'http://localhost:5173', 'http://localhost:5174'],
    credentials: true
}));
app.use(express.json());
app.use(session({
    secret: 'bim-admin-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    }
}));

// --- DIRECTORIES ---
const uploadsDir = path.join(__dirname, 'uploads');
const qrCodesDir = path.join(__dirname, 'qr-codes');
const modelsDir = path.join(__dirname, 'models');

[uploadsDir, qrCodesDir, modelsDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use('/models', express.static(uploadsDir));
app.use('/qr-codes', express.static(qrCodesDir));

// --- DATABASE ---
console.log('--- Loading Database ---');
const db = require('./database');
db.initDatabase();

// --- AUTH & BUSINESS ROUTES ---
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadsDir),
        filename: (req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`)
    })
});

const requireAuth = (req, res, next) => {
    if (req.session && req.session.userId) next();
    else res.status(401).json({ error: 'Auth required' });
};

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.getUserByUsername(username);
    if (user && bcrypt.compareSync(password, user.password_hash)) {
        req.session.userId = user.id;
        res.json({ message: 'OK', user: { id: user.id, username: user.username } });
    } else res.status(401).json({ error: 'Failed' });
});

app.get('/api/projects', requireAuth, (req, res) => res.json(db.getAllProjects()));
app.get('/api/files', requireAuth, (req, res) => res.json(db.getAllFiles()));

app.post('/api/qr/generate', requireAuth, async (req, res) => {
    try {
        const { project_id, file_id, element_id } = req.body;
        const qrId = uuidv4();
        const qrFileName = `qr-${qrId}.png`;
        const qrPath = path.join(qrCodesDir, qrFileName);
        const viewerUrl = `https://vh-ifc-viewer.vercel.app/viewer?project=${project_id}&file=${file_id}&element=${element_id}`;
        await QRCode.toFile(qrPath, viewerUrl);
        const qr = db.createQRCode(qrId, project_id, file_id, element_id, `/qr-codes/${qrFileName}`);
        res.status(201).json(qr);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/viewer/resolve/:elementId', (req, res) => {
    const qr = db.getAllQRCodes().find(q => q.element_id === req.params.elementId);
    if (!qr) return res.status(404).json({ error: 'Not found' });
    const file = db.getFileById(qr.file_id);
    res.json({ file_url: `/models/${file.filename}`, element_id: qr.element_id });
});

// --- MISSING API ROUTES FIX ---

// Project Detail
app.get('/api/projects/:id', requireAuth, (req, res) => {
    const project = db.getProjectById(req.params.id);
    if (project) res.json(project);
    else res.status(404).json({ error: "Project not found" });
});

app.post('/api/projects', requireAuth, (req, res) => {
    const { name, description, status } = req.body;
    const newProject = db.createProject(uuidv4(), name, description || '', status || 'active');
    res.status(201).json(newProject);
});

app.put('/api/projects/:id', requireAuth, (req, res) => {
    const updated = db.updateProject(req.params.id, req.body);
    if (updated) res.json(updated);
    else res.status(404).json({ error: "Project not found" });
});

app.delete('/api/projects/:id', requireAuth, (req, res) => {
    db.deleteProject(req.params.id);
    res.status(204).send();
});

// Project Files
app.get('/api/projects/:id/files', requireAuth, (req, res) => {
    const projectFiles = db.getFilesByProjectId(req.params.id);
    res.json(projectFiles);
});

// File Upload
app.post('/api/projects/:id/upload', requireAuth, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Create DB entry
    const newFile = db.createFile(
        uuidv4(),
        req.params.id,
        req.file.filename,
        req.file.originalname,
        req.file.size,
        path.extname(req.file.originalname)
    );

    // Log activity
    if (req.session.userId) {
        const user = db.getUserByUsername('admin'); // Simplify for now or fetch real user
        db.logActivity(user?.id, user?.username, 'upload', `Bestand ${newFile.originalname} geupload`);
    }

    res.status(201).json(newFile);
});

// File Actions
app.delete('/api/files/:id', requireAuth, (req, res) => {
    const file = db.getFileById(req.params.id);
    if (file) {
        // Try delete physical file
        try {
            fs.unlinkSync(path.join(uploadsDir, file.filename));
        } catch (e) { console.error("File delete error:", e); }
        db.deleteFile(req.params.id);
        res.status(204).send();
    } else {
        res.status(404).json({ error: "File not found" });
    }
});

// QR Actions
app.get('/api/qr', requireAuth, (req, res) => res.json(db.getAllQRCodes()));
app.delete('/api/qr/:id', requireAuth, (req, res) => {
    db.deleteQRCode(req.params.id);
    res.status(204).send();
});

// Statistics & Activity
app.get('/api/statistics', requireAuth, (req, res) => {
    res.json(db.getStatistics());
});

app.get('/api/activity', requireAuth, (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    res.json(db.getRecentActivity(limit));
});

// --- GO ---
app.listen(port, '0.0.0.0', () => {
    console.log(`\n🚀 BIM Backend active on port ${port}`);
    console.log(`--- Server Details ---`);
    console.log(`Dir: ${__dirname}`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`----------------------\n`);
});
