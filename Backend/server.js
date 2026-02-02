const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

// 1. Basic app setup
const app = express();
const port = process.env.PORT || 3001;
const frontendUrl = process.env.FRONTEND_URL || '*';

// Standard request logger for debugging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// 2. Health check routes FIRST (Must respond immediately)
app.get('/', (req, res) => res.send('VH IFC Viewer Backend is running 🚀'));
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// 3. Start listening IMMEDIATELY
app.listen(port, '0.0.0.0', () => {
    console.log(`--- SERVER CONFIG ---`);
    console.log(`Port: ${port}`);
    console.log(`Host: 0.0.0.0 (Publicly accessible)`);
    console.log(`Frontend URL: ${frontendUrl}`);
    console.log(`🚀 Server listening on http://0.0.0.0:${port}`);
    console.log(`---------------------`);

    // 4. Initialize everything else AFTER binding the port
    setTimeout(initializeBackend, 100);
});

async function initializeBackend() {
    try {
        console.log('--- Initializing Backend Services ---');

        console.log('--- Loading Database ---');
        const db = require('./database');
        console.log('✅ Database module loaded');

        // Directories
        const uploadsDir = path.join(__dirname, 'uploads');
        const qrCodesDir = path.join(__dirname, 'qr-codes');
        const modelsDir = path.join(__dirname, 'models');

        console.log('--- Creating Directories ---');
        [uploadsDir, qrCodesDir, modelsDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`✅ Created: ${dir}`);
            }
        });

        // Middleware
        app.use(cors({
            origin: frontendUrl === '*' ? true : [frontendUrl, 'http://localhost:5173', 'http://localhost:5174'],
            credentials: true
        }));
        app.use(express.json());
        app.use(session({
            secret: 'bim-admin-secret-key-change-in-production',
            resave: false,
            saveUninitialized: false,
            cookie: {
                secure: false,
                httpOnly: true,
                maxAge: 24 * 60 * 60 * 1000
            }
        }));

        // Serve static files
        app.use('/models', express.static(uploadsDir));
        app.use('/qr-codes', express.static(qrCodesDir));

        // Define all other routes... 
        // Note: For simplicity, I'll need to keep the structure clean
        setupRoutes(app, db, uploadsDir, qrCodesDir, modelsDir);

        console.log('--- Initializing Admin User ---');
        const users = db.getUserByUsername('admin');
        if (!users) {
            const passwordHash = bcrypt.hashSync('admin123', 10);
            db.createUser(uuidv4(), 'admin', passwordHash, 'admin');
            console.log('✅ Default admin user created');
        }

        console.log('✅ Backend Initialization Complete');
    } catch (err) {
        console.error('❌ CRITICAL INITIALIZATION ERROR:', err);
    }
}

function setupRoutes(app, db, uploadsDir, qrCodesDir, modelsDir) {
    // Multer setup
    const storage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadsDir),
        filename: (req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`)
    });
    const upload = multer({
        storage,
        limits: { fileSize: 500 * 1024 * 1024 },
        fileFilter: (req, file, cb) => {
            if (file.originalname.toLowerCase().endsWith('.ifc')) cb(null, true);
            else cb(new Error('Only .ifc files are allowed'));
        }
    });

    const requireAuth = (req, res, next) => {
        if (req.session && req.session.userId) next();
        else res.status(401).json({ error: 'Authentication required' });
    };

    // --- AUTH ---
    app.post('/api/auth/login', async (req, res) => {
        try {
            const { username, password } = req.body;
            const user = db.getUserByUsername(username);
            if (user && bcrypt.compareSync(password, user.password_hash)) {
                req.session.userId = user.id;
                req.session.role = user.role;
                res.json({ message: 'Login successful', user: { id: user.id, username: user.username, role: user.role } });
            } else {
                res.status(401).json({ error: 'Invalid credentials' });
            }
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.post('/api/auth/logout', (req, res) => {
        req.session.destroy();
        res.json({ message: 'Logged out' });
    });

    app.get('/api/auth/me', requireAuth, (req, res) => {
        const user = db.getUserById(req.session.userId);
        if (user) res.json({ id: user.id, username: user.username, role: user.role });
        else res.status(404).json({ error: 'User not found' });
    });

    // --- PROJECTS ---
    app.get('/api/projects', requireAuth, (req, res) => res.json(db.getAllProjects()));
    app.get('/api/projects/:id', requireAuth, (req, res) => {
        const p = db.getProjectById(req.params.id);
        if (p) res.json(p); else res.status(404).json({ error: 'Project not found' });
    });
    app.post('/api/projects', requireAuth, (req, res) => {
        const { name, description } = req.body;
        res.status(201).json(db.createProject(uuidv4(), name, description));
    });

    // --- FILES ---
    app.get('/api/files', requireAuth, (req, res) => res.json(db.getAllFiles()));
    app.post('/api/files/upload', requireAuth, upload.single('file'), (req, res) => {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const { project_id } = req.body;
        const file = db.createFile(uuidv4(), project_id, req.file.originalname, req.file.filename, req.file.size, req.file.mimetype);
        res.status(201).json(file);
    });

    // --- QR ---
    app.post('/api/qr/generate', requireAuth, async (req, res) => {
        try {
            const { project_id, file_id, element_id } = req.body;
            const qrId = uuidv4();
            const qrFileName = `qr-${qrId}.png`;
            const qrPath = path.join(qrCodesDir, qrFileName);

            // Generate public URL for the viewer
            // This is the link that will be embedded in the QR
            const publicViewerUrl = `https://vh-ifc-viewer.vercel.app/viewer?project=${project_id}&file=${file_id}&element=${element_id}`;

            await QRCode.toFile(qrPath, publicViewerUrl);

            const qr = db.createQrCode(qrId, project_id, file_id, element_id, `/qr-codes/${qrFileName}`);
            res.status(201).json({ ...qr, qr_image_url: qr.qr_image_url });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // --- VIEW DATA ---
    app.get('/api/viewer/resolve/:elementId', (req, res) => {
        // Find newest QR/File for this element
        const qr = db.getAllQrCodes().find(q => q.element_id === req.params.elementId);
        if (!qr) return res.status(404).json({ error: 'Element not found' });

        const file = db.getFileById(qr.file_id);
        if (!file) return res.status(404).json({ error: 'File not found' });

        res.json({
            file_url: `/models/${file.filename}`,
            element_id: qr.element_id,
            project_id: qr.project_id
        });
    });
}

process.on('uncaughtException', (err) => {
    console.error('❌ UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ UNHANDLED REJECTION:', reason);
});
