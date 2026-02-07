try {
    require('dotenv').config();
} catch (e) {
    console.log('Dotenv not loaded (likely in production with env vars set)');
}
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
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// DEBUG MIDDLEWARE: Log raw request details
app.use((req, res, next) => {
    if (req.path.includes('/auth/login')) {
        console.log(`[REQ] ${req.method} ${req.path}`);
        console.log(`[REQ] Content-Type: ${req.get('Content-Type')}`);
        console.log(`[REQ] Headers:`, JSON.stringify(req.headers));
    }
    next();
});

app.use(express.json());

// DEBUG MIDDLEWARE: Log parsed body
app.use((req, res, next) => {
    if (req.path.includes('/auth/login')) {
        console.log(`[REQ] Body after parse:`, JSON.stringify(req.body));
    }
    next();
});
app.use(session({
    secret: 'bim-admin-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true, // Required for SameSite: None
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'none' // Required for Cross-Site (Vercel -> Ngrok)
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
// db.initDatabase() is async, but we can't await top-level in CJS without IIFE or ignored promise.
// Just verify it starts.
db.initDatabase().then(() => console.log('DB Init initiated'));

// --- AUTH & BUSINESS ROUTES ---
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadsDir),
        filename: (req, file, cb) => {
            // Sanitize filename: remove spaces and special chars, keep dots/dashes
            const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
            cb(null, `${uuidv4()}-${cleanName}`);
        }
    })
});

const requireAuth = (req, res, next) => {
    if (req.session && req.session.userId) next();
    else res.status(401).json({ error: 'Auth required' });
};

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    console.log(`[LOGIN] Attempt for user: ${username}`);
    const user = await db.getUserByUsername(username);
    console.log(`[LOGIN] User found:`, user ? 'YES' : 'NO');
    if (user && bcrypt.compareSync(password, user.password_hash)) {
        req.session.userId = user.id;
        console.log(`[LOGIN] Success! Session ID: ${req.session.id}`);
        res.json({ message: 'OK', user: { id: user.id, username: user.username } });
    } else {
        console.log(`[LOGIN] Failed - Invalid credentials`);
        res.status(401).json({ error: 'Failed' });
    }
});

app.get('/api/users', requireAuth, async (req, res) => {
    try {
        const users = await db.getAllUsers();
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/projects', requireAuth, async (req, res) => res.json(await db.getAllProjects()));
app.get('/api/files', requireAuth, async (req, res) => {
    try {
        if (req.query.projectId) {
            const files = await db.getFilesByProjectId(req.query.projectId);
            res.json(files);
        } else {
            const files = await db.getAllFiles();
            res.json(files);
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- FILES ROUTES ---

app.post('/api/files', requireAuth, upload.single('ifcFile'), async (req, res) => {
    try {
        console.log(`[UPLOAD] File upload started`);
        if (!req.file) {
            console.log(`[UPLOAD] No file received`);
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { projectId } = req.body;
        console.log(`[UPLOAD] File: ${req.file.originalname} for Project: ${projectId}`);

        // Create file entry AND upload to Supabase Storage (passing path)
        const newFile = await db.createFile(null, projectId, req.file.filename, req.file.originalname, req.file.size, 'ifc', req.file.path);

        // Clean up temp file (async, don't block response)
        const fs = require('fs');
        fs.unlink(req.file.path, (err) => {
            if (err) console.error('Failed to cleanup temp file:', err);
            else console.log('Temp file cleaned up');
        });

        console.log(`[UPLOAD] Success: ${newFile.id}`);
        res.json(newFile);
    } catch (e) {
        console.error(`[UPLOAD] Error:`, e);
        res.status(500).json({ error: e.message });
    }
});

// Redirect to Supabase Storage URL
app.get('/api/files/:id/download', async (req, res) => {
    try {
        const file = await db.getFileById(req.params.id);
        if (!file) return res.status(404).json({ error: 'File not found' });

        // Get public URL from Supabase
        const publicUrl = await db.getFileDownloadUrl(file.path);

        if (publicUrl) {
            console.log(`[DOWNLOAD] Redirecting to: ${publicUrl}`);
            res.redirect(publicUrl);
        } else {
            res.status(404).json({ error: 'File not found in storage' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- PUBLIC ROUTES (No Auth Required) ---
app.get('/api/public/ifc/:publicId', async (req, res) => {
    try {
        const link = await db.getPublicLink(req.params.publicId);
        if (!link) return res.status(404).json({ error: 'Invalid or expired link' });

        // Check expiry if field exists (optional)
        if (link.expires_at && new Date(link.expires_at) < new Date()) {
            return res.status(410).json({ error: 'Link expired' });
        }

        // Generate Download URL
        const downloadUrl = await db.getFileDownloadUrl(link.files.path);

        res.json({
            modelUrl: downloadUrl,
            filename: link.files.original_name
        });
    } catch (e) {
        console.error('Public Access Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// --- ADMIN QR/LINK ROUTES ---
app.post('/api/admin/public-link', requireAuth, async (req, res) => {
    try {
        const { project_id, file_id } = req.body;
        const link = await db.createPublicLink(project_id, file_id);

        // Construct Viewer URL
        // Use env FRONTEND_URL or default to localhost for dev
        const baseUrl = process.env.FRONTEND_URL && process.env.FRONTEND_URL !== '*'
            ? process.env.FRONTEND_URL
            : 'http://localhost:5173';

        const viewerUrl = `${baseUrl}/v/${link.public_id}`;

        // Optionally generate QR image for download
        const qrId = uuidv4();
        const qrFileName = `qr-${qrId}.png`;
        const qrPath = path.join(qrCodesDir, qrFileName);

        await QRCode.toFile(qrPath, viewerUrl);

        // Return link info + QR image path (local static path)
        res.status(201).json({
            ...link,
            viewerUrl,
            qrImageUrl: `/qr-codes/${qrFileName}`
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Legacy /api/qr/generate - Keep or Deprecate?
// Let's redirect logic to new flow if client uses it, or just leave as is?
// The prompt implies we need a NEW public viewer flow.
// I will comment out the old one to avoid confusion.
// app.post('/api/qr/generate', ...);

app.get('/api/viewer/resolve/:elementId', async (req, res) => {
    const qrs = await db.getAllQRCodes();
    const qr = qrs.find(q => q.element_id === req.params.elementId);
    if (!qr) return res.status(404).json({ error: 'Not found' });

    const file = await db.getFileById(qr.file_id);
    if (!file) return res.status(404).json({ error: 'File not found' });

    // Use signed URL instead of /models/
    const publicUrl = await db.getFileDownloadUrl(file.path);

    res.json({ file_url: publicUrl, element_id: qr.element_id });
});

// --- MISSING API ROUTES FIX ---

// Project Detail
app.get('/api/projects/:id', requireAuth, async (req, res) => {
    const project = await db.getProjectById(req.params.id);
    if (project) res.json(project);
    else res.status(404).json({ error: "Project not found" });
});

app.post('/api/projects', requireAuth, async (req, res) => {
    const { name, description, status } = req.body;
    const newProject = await db.createProject(uuidv4(), name, description || '', status || 'active');
    res.status(201).json(newProject);
});

app.put('/api/projects/:id', requireAuth, async (req, res) => {
    const updated = await db.updateProject(req.params.id, req.body);
    if (updated) res.json(updated);
    else res.status(404).json({ error: "Project not found" });
});

app.delete('/api/projects/:id', requireAuth, async (req, res) => {
    await db.deleteProject(req.params.id);
    res.status(204).send();
});

// Project Files
app.get('/api/projects/:id/files', requireAuth, async (req, res) => {
    const projectFiles = await db.getFilesByProjectId(req.params.id);
    res.json(projectFiles);
});

// File Upload
app.post('/api/projects/:id/upload', requireAuth, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Create DB entry
    // Create DB entry AND upload to Supabase Storage
    const newFile = await db.createFile(
        uuidv4(),
        req.params.id,
        req.file.filename,
        req.file.originalname,
        req.file.size,
        path.extname(req.file.originalname),
        req.file.path // <--- Pass the temp path!
    );

    // Clean up temp file
    const fs = require('fs');
    fs.unlink(req.file.path, (err) => {
        if (err) console.error('Failed to cleanup temp file:', err);
    });

    // Log activity
    if (req.session.userId) {
        // Updated to matching signature: (projectId, user, type, details)
        // We don't have username readily available in session unless we stored it.
        // Let's assume 'Admin' or fetch it. For now 'Admin'.
        await db.logActivity(req.params.id, 'Admin', 'upload', `Bestand ${newFile.original_name} geupload`);
    }

    res.status(201).json(newFile);
});

// File Actions
app.delete('/api/files/:id', requireAuth, async (req, res) => {
    const file = await db.getFileById(req.params.id);
    if (file) {
        // Legacy local delete removed
        // try {
        //     fs.unlinkSync(path.join(uploadsDir, file.filename));
        // } catch (e) { console.error("File delete error:", e); }
        await db.deleteFile(req.params.id);
        res.status(204).send();
    } else {
        res.status(404).json({ error: "File not found" });
    }
});

// QR Actions
app.get('/api/qr', requireAuth, async (req, res) => res.json(await db.getAllQRCodes()));
app.delete('/api/qr/:id', requireAuth, async (req, res) => {
    await db.deleteQRCode(req.params.id);
    res.status(204).send();
});

// Statistics & Activity
app.get('/api/statistics', requireAuth, async (req, res) => {
    res.json(await db.getStatistics());
});

app.get('/api/activity', requireAuth, async (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    res.json(await db.getRecentActivity(limit));
});

// --- GO ---
app.listen(port, '0.0.0.0', () => {
    console.log(`\n🚀 BIM Backend active on port ${port}`);
    console.log(`--- Server Details ---`);
    console.log(`Dir: ${__dirname}`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`----------------------\n`);
});
