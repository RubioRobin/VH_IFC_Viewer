try {
    require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (e) {
    console.log('Dotenv niet geladen (waarschijnlijk productie)');
}
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const db = require('./database');

// Routes
const { router: authRouter } = require('./routes/auth');
const projectsRouter = require('./routes/projects');
const { router: filesRouter } = require('./routes/files');
const uploadRouter = require('./routes/upload'); // Add this
const qrRouter = require('./routes/qr');
const publicRouter = require('./routes/public');
const usersRouter = require('./routes/users');
const adminRouter = require('./routes/admin');
const statsRouter = require('./routes/stats');
const debugRouter = require('./routes/debug');
const pluginRouter = require('./routes/plugin');
const shareRouter = require('./routes/share');



const helmet = require('helmet');
const xss = require('xss-clean');

// ... (imports)

const app = express();
const port = process.env.PORT || 3001;

// Trust Proxy for Render (important for secure cookies)
app.set('trust proxy', 1);

const frontendUrl = process.env.FRONTEND_URL || '*';

// --- CONFIG & HEALTH ---
app.set('trust proxy', 1);

// --- SECURITY MIDDLEWARE ---
app.use(helmet({
    contentSecurityPolicy: false, // Allow inline scripts/styles for now to avoid breaking existing UI
    crossOriginResourcePolicy: { policy: "cross-origin" } // Allow file downloads
}));
app.use(xss());

// ... (logging)

app.get('/', (req, res) => {
    res.send('VH IFC Viewer Backend is ONLINE! 🚀');
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- MIDDLEWARE ---
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        const allowedOrigins = [frontendUrl, 'http://localhost:5173', 'http://localhost:5174'];
        if (frontendUrl === '*' || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10kb' })); // Body limit against DoS

const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';

app.use(session({
    secret: process.env.SESSION_SECRET || 'bim-admin-secret-key-CHANGE-THIS-IN-PROD',
    resave: false,
    saveUninitialized: false,
    proxy: true, // Required for Render/Heroku to trust the proxy for secure cookies
    cookie: {
        secure: isProduction, // Secure needs HTTPS
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: isProduction ? 'none' : 'lax' // 'none' required for cross-site (frontend <-> backend)
    }
}));

// --- DATABASE INIT ---
db.initDatabase().then(() => console.log('Database initialisatie gestart'));

// --- ROUTES ---
app.use('/api/auth', authRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/files', filesRouter);
app.use('/api/upload', uploadRouter); // Add this
app.use('/api/qr', qrRouter);
app.use('/api/public', publicRouter);
app.use('/api/users', usersRouter);
app.use('/api/admin', adminRouter);
app.use('/api', statsRouter);
app.use('/api/plugin', pluginRouter);
app.use('/api/share', shareRouter);




// Static Files (Tijdelijk voor backward compatibility als er nog harde links zijn)
const uploadsDir = path.join(__dirname, 'uploads');
const qrCodesDir = path.join(__dirname, 'qr-codes');
[uploadsDir, qrCodesDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});
app.use('/models', express.static(uploadsDir));
app.use('/qr-codes', express.static(qrCodesDir));

// --- SERVER START ---
app.listen(port, '0.0.0.0', () => {
    console.log(`\n🚀 VH Backend actief op poort ${port}`);
});
