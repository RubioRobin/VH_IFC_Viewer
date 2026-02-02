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

// Essential for Railway/Proxies
app.set('trust proxy', 1);

// Comprehensive Request Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - (IP: ${req.ip})`);
    next();
});

// Primary Health Checks
app.get('/', (req, res) => res.send('BIM Backend: Online 🚀'));
app.get('/api/health', (req, res) => res.json({ status: 'ok', port, time: new Date().toISOString() }));

// Middleware
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

// Setup Persistence
const baseDir = process.cwd();
const uploadsDir = path.join(baseDir, 'uploads');
const qrCodesDir = path.join(baseDir, 'qr-codes');
const modelsDir = path.join(baseDir, 'models');

[uploadsDir, qrCodesDir, modelsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`✅ Folder confirmed: ${dir}`);
    }
});

app.use('/models', express.static(uploadsDir));
app.use('/qr-codes', express.static(qrCodesDir));

// Load Database
console.log('--- Loading Database ---');
const db = require('./database');

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
    else res.status(401).json({ error: 'Unauthorized' });
};

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.getUserByUsername(username);
    if (user && bcrypt.compareSync(password, user.password_hash)) {
        req.session.userId = user.id;
        res.json({ message: 'OK', user: { id: user.id, username: user.username } });
    } else res.status(401).json({ error: 'Auth Failed' });
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
    if (!qr) return res.status(404).json({ error: 'Not Found' });
    const file = db.getFileById(qr.file_id);
    res.json({ file_url: `/models/${file.filename}`, element_id: qr.element_id });
});

// START SERVER
console.log(`\n--- SERVER START ATTEMPT ---`);
console.log(`Port: ${port}`);
console.log(`CWD: ${process.cwd()}`);

app.listen(port, () => {
    console.log(`\n🚀 BIM Backend Running on port ${port}`);
    console.log(`📡 Local: http://localhost:${port}`);

    // Explicitly verify binding
    setInterval(() => {
        const timestamp = new Date().toISOString();
        console.log(`[STATUS] ${timestamp} - Server active - Port ${port}`);
    }, 60000);
});
