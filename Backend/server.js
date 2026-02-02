const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
console.log('--- Loading Dependencies ---');
const db = require('./database');
console.log('✅ Dependencies loaded');

const app = express();
const port = process.env.PORT || 3001;
const frontendUrl = process.env.FRONTEND_URL || '*';

// Standard request logger for debugging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

console.log('--- SERVER CONFIG ---');
console.log('Port:', port);
console.log('Frontend URL:', frontendUrl);
console.log('---------------------');

// Basic health check routes
app.get('/', (req, res) => {
    res.send('VH IFC Viewer Backend is running 🚀');
});
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Directories (must be defined before middleware that uses them)
const uploadsDir = path.join(__dirname, 'uploads');
const qrCodesDir = path.join(__dirname, 'qr-codes');
const modelsDir = path.join(__dirname, 'models'); // Use local models dir in cloud

// Ensure directories exist
[uploadsDir, qrCodesDir, modelsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
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
        secure: false, // Set to true in production with HTTPS
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Serve static files
app.use('/models', express.static(uploadsDir)); // Serve uploaded IFC files
app.use('/qr-codes', express.static(qrCodesDir)); // Serve QR code images

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
    fileFilter: (req, file, cb) => {
        if (file.originalname.toLowerCase().endsWith('.ifc')) {
            cb(null, true);
        } else {
            cb(new Error('Only .ifc files are allowed'));
        }
    }
});

// Authentication middleware
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
}

// Create default admin user if none exists
function initDefaultUser() {
    const users = db.getUserByUsername('admin');
    if (!users) {
        const passwordHash = bcrypt.hashSync('admin123', 10);
        db.createUser(uuidv4(), 'admin', passwordHash, 'admin');
        console.log('✅ Default admin user created (username: admin, password: admin123)');
    }
}

// Initializing Admin User moved to server start
// initDefaultUser();

// ==================== AUTHENTICATION ====================

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        const user = db.getUserByUsername(username);

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        req.session.userId = user.id;
        req.session.username = user.username;

        db.logActivity(user.id, 'login', `User ${username} logged in`);

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
    const userId = req.session.userId;
    db.logActivity(userId, 'logout', 'User logged out');
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
    const user = db.getUserById(req.session.userId);
    if (user) {
        res.json({
            id: user.id,
            username: user.username,
            role: user.role
        });
    } else {
        res.status(404).json({ error: 'User not found' });
    }
});

app.get('/api/users', requireAuth, (req, res) => {
    try {
        const users = db.getAllUsers();
        res.json(users);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.delete('/api/users/:id', requireAuth, (req, res) => {
    try {
        if (req.params.id === req.session.userId) {
            return res.status(400).json({ error: 'Cannot delete yourself' });
        }

        const success = db.deleteUser(req.params.id);
        if (success) {
            db.logActivity(req.session.userId, 'delete_user', `Deleted user ${req.params.id}`);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// ==================== PROJECTS ====================

app.get('/api/projects', requireAuth, (req, res) => {
    try {
        const projects = db.getAllProjects();
        res.json(projects);
    } catch (error) {
        console.error('Get projects error:', error);
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});

app.get('/api/projects/:id', requireAuth, (req, res) => {
    try {
        const project = db.getProjectById(req.params.id);
        if (project) {
            res.json(project);
        } else {
            res.status(404).json({ error: 'Project not found' });
        }
    } catch (error) {
        console.error('Get project error:', error);
        res.status(500).json({ error: 'Failed to fetch project' });
    }
});

app.post('/api/projects', requireAuth, (req, res) => {
    try {
        const { name, description, status } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Project name is required' });
        }

        const projectId = uuidv4();
        const project = db.createProject(projectId, name, description || '', status || 'active');

        db.logActivity(req.session.userId, 'create_project', `Created project: ${name}`);

        res.status(201).json(project);
    } catch (error) {
        console.error('Create project error:', error);
        res.status(500).json({ error: 'Failed to create project' });
    }
});

app.put('/api/projects/:id', requireAuth, (req, res) => {
    try {
        const { name, description, status } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Project name is required' });
        }

        const project = db.updateProject(req.params.id, name, description, status);

        if (project) {
            db.logActivity(req.session.userId, 'update_project', `Updated project: ${name}`);
            res.json(project);
        } else {
            res.status(404).json({ error: 'Project not found' });
        }
    } catch (error) {
        console.error('Update project error:', error);
        res.status(500).json({ error: 'Failed to update project' });
    }
});

app.delete('/api/projects/:id', requireAuth, (req, res) => {
    try {
        const project = db.getProjectById(req.params.id);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        db.deleteProject(req.params.id);
        db.logActivity(req.session.userId, 'delete_project', `Deleted project: ${project.name}`);

        res.json({ success: true });
    } catch (error) {
        console.error('Delete project error:', error);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

// ==================== FILES ====================

app.get('/api/files', requireAuth, (req, res) => {
    try {
        const files = db.getAllFiles();
        res.json(files);
    } catch (error) {
        console.error('Get files error:', error);
        res.status(500).json({ error: 'Failed to fetch files' });
    }
});

app.get('/api/projects/:id/files', requireAuth, (req, res) => {
    try {
        const files = db.getFilesByProject(req.params.id);
        res.json(files);
    } catch (error) {
        console.error('Get project files error:', error);
        res.status(500).json({ error: 'Failed to fetch files' });
    }
});

app.post('/api/projects/:id/upload', requireAuth, upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const project = db.getProjectById(req.params.id);
        if (!project) {
            // Clean up uploaded file
            fs.unlinkSync(req.file.path);
            return res.status(404).json({ error: 'Project not found' });
        }

        const fileId = uuidv4();
        const file = db.createIFCFile(
            fileId,
            req.params.id,
            req.file.originalname,
            req.file.path,
            req.file.size,
            JSON.stringify({
                mimetype: req.file.mimetype,
                encoding: req.file.encoding
            })
        );

        db.logActivity(req.session.userId, 'upload_file', `Uploaded file: ${req.file.originalname} to project: ${project.name}`);

        res.status(201).json(file);
    } catch (error) {
        console.error('Upload file error:', error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: 'Failed to upload file' });
    }
});

app.delete('/api/files/:id', requireAuth, (req, res) => {
    try {
        const file = db.getFileById(req.params.id);
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        db.deleteFile(req.params.id);
        db.logActivity(req.session.userId, 'delete_file', `Deleted file: ${file.filename}`);

        res.json({ success: true });
    } catch (error) {
        console.error('Delete file error:', error);
        res.status(500).json({ error: 'Failed to delete file' });
    }
});

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

// ==================== QR CODES ====================

app.get('/api/qr', requireAuth, (req, res) => {
    try {
        const qrCodes = db.getAllQRCodes();
        res.json(qrCodes);
    } catch (error) {
        console.error('Get QR codes error:', error);
        res.status(500).json({ error: 'Failed to fetch QR codes' });
    }
});

app.get('/api/projects/:id/qr', requireAuth, (req, res) => {
    try {
        const qrCodes = db.getQRCodesByProject(req.params.id);
        res.json(qrCodes);
    } catch (error) {
        console.error('Get project QR codes error:', error);
        res.status(500).json({ error: 'Failed to fetch QR codes' });
    }
});

app.post('/api/qr/generate', requireAuth, async (req, res) => {
    try {
        const { project_id, file_id, element_id } = req.body;

        if (!project_id || !file_id) {
            return res.status(400).json({ error: 'project_id and file_id are required' });
        }

        const project = db.getProjectById(project_id);
        const file = db.getFileById(file_id);

        if (!project || !file) {
            return res.status(404).json({ error: 'Project or file not found' });
        }

        const qrId = uuidv4();

        // Generate viewer URL
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        let viewerUrl = `${frontendUrl}/?model=${encodeURIComponent(file.filename)}`;
        if (element_id) {
            viewerUrl += `&id=${encodeURIComponent(element_id)}`;
        }

        // Generate QR code image
        const qrImagePath = path.join(qrCodesDir, `${qrId}.png`);
        await QRCode.toFile(qrImagePath, viewerUrl, {
            width: 512,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });

        const qrCode = db.createQRCode(qrId, project_id, file_id, element_id, viewerUrl, qrImagePath);

        db.logActivity(req.session.userId, 'generate_qr', `Generated QR code for element: ${element_id}`);

        res.status(201).json({
            ...qrCode,
            qr_image_url: `/qr-codes/${qrId}.png`
        });
    } catch (error) {
        console.error('Generate QR code error:', error);
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

app.get('/api/qr/:id', (req, res) => {
    try {
        const qrCode = db.getQRCodeById(req.params.id);
        if (!qrCode) {
            return res.status(404).json({ error: 'QR code not found' });
        }

        if (qrCode.qr_image_path && fs.existsSync(qrCode.qr_image_path)) {
            res.sendFile(qrCode.qr_image_path);
        } else {
            res.status(404).json({ error: 'QR code image not found' });
        }
    } catch (error) {
        console.error('Get QR code error:', error);
        res.status(500).json({ error: 'Failed to fetch QR code' });
    }
});

app.delete('/api/qr/:id', requireAuth, (req, res) => {
    try {
        const qrCode = db.getQRCodeById(req.params.id);
        if (!qrCode) {
            return res.status(404).json({ error: 'QR code not found' });
        }

        db.deleteQRCode(req.params.id);
        db.logActivity(req.session.userId, 'delete_qr', `Deleted QR code: ${qrCode.id}`);

        res.json({ success: true });
    } catch (error) {
        console.error('Delete QR code error:', error);
        res.status(500).json({ error: 'Failed to delete QR code' });
    }
});

// Serve QR code images
app.use('/qr-codes', express.static(qrCodesDir));

// ==================== STATISTICS ====================

app.get('/api/statistics', requireAuth, (req, res) => {
    try {
        const stats = db.getStatistics();
        res.json(stats);
    } catch (error) {
        console.error('Get statistics error:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// ==================== ACTIVITY LOG ====================

app.get('/api/activity', requireAuth, (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const activity = db.getRecentActivity(limit);
        res.json(activity);
    } catch (error) {
        console.error('Get activity error:', error);
        res.status(500).json({ error: 'Failed to fetch activity' });
    }
});

// ==================== LEGACY MODELS ENDPOINT ====================

// Serve static files from models directory
app.use('/models', express.static(modelsDir));

// API to list models (legacy support)
app.get('/api/models', (req, res) => {
    fs.readdir(modelsDir, (err, files) => {
        if (err) {
            console.error("Error scanning directory:", err);
            return res.status(500).json({ error: 'Unable to list models' });
        }

        const ifcFiles = files.filter(file => file.toLowerCase().endsWith('.ifc'));
        res.json(ifcFiles);
    });
});

// ==================== SERVER START ====================

console.log('--- Starting Server ---');
app.listen(port, () => {
    console.log(`\n🚀 BIM Admin Backend running at port: ${port}`);
    console.log(`📁 Serving models from: ${modelsDir}`);
    console.log(`📤 Uploads directory: ${uploadsDir}`);
    console.log(`📱 QR codes directory: ${qrCodesDir}`);

    console.log('--- Initializing Admin User ---');
    initDefaultUser();
    console.log('✅ Admin user check complete');

    console.log('\n🔐 Default login: username=admin, password=admin123\n');
});

process.on('uncaughtException', (err) => {
    console.error('❌ UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ UNHANDLED REJECTION:', reason);
});
