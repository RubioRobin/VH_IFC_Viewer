const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

console.log('--- STARTING UP (Stage 1) ---');

const app = express();
const port = parseInt(process.env.PORT || '3001', 10);
const frontendUrl = process.env.FRONTEND_URL || '*';

// Request Logger (First middleware)
app.use((req, res, next) => {
    console.log(`[REQ] ${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
});

// Health Check (Responsive immediately)
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString(), port });
});

app.get('/', (req, res) => {
    res.send(`Backend is UP and listening on port ${port} 🚀`);
});

// Basic Middleware
app.use(cors({
    origin: frontendUrl === '*' ? true : [frontendUrl, 'http://localhost:5173', 'http://localhost:5174'],
    credentials: true
}));
app.use(express.json());
app.use(session({
    secret: 'bim-admin-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

// Initialize DB and Folders
console.log('--- INITIALIZING DB & FOLDERS (Stage 2) ---');
let db;
try {
    db = require('./database');
    console.log('✅ Database module loaded');
} catch (e) {
    console.error('❌ FAILED TO LOAD DATABASE:', e);
}

const uploadsDir = path.join(__dirname, 'uploads');
const qrCodesDir = path.join(__dirname, 'qr-codes');
const modelsDir = path.join(__dirname, 'models');

[uploadsDir, qrCodesDir, modelsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`✅ Directory created: ${dir}`);
    }
});

app.use('/models', express.static(uploadsDir));
app.use('/qr-codes', express.static(qrCodesDir));

// --- ROUTES ---
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadsDir),
        filename: (req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`)
    }),
    limits: { fileSize: 500 * 1024 * 1024 }
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
        res.json({ user: { id: user.id, username: user.username } });
    } else res.status(401).json({ error: 'Invalid' });
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

// Final Start
console.log(`--- BINDING TO PORT ${port} (Stage 3) ---`);
const server = app.listen(port, '0.0.0.0', () => {
    console.log(`\n🚀 BIM Backend Running!`);
    console.log(`📡 URL: http://0.0.0.0:${port}`);
    console.log(`-------------------------\n`);

    // Heartbeat to keep logs alive
    setInterval(() => console.log(`[HEARTBEAT] ${new Date().toISOString()}`), 30000);
});

server.on('error', (err) => {
    console.error('❌ SERVER BINDING ERROR:', err);
});
