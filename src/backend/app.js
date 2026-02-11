try {
    require('dotenv').config();
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
const qrRouter = require('./routes/qr');
const publicRouter = require('./routes/public');
const adminRouter = require('./routes/admin');
const statsRouter = require('./routes/stats');
const debugRouter = require('./routes/debug');



const app = express();
const port = process.env.PORT || 3001;
const frontendUrl = process.env.FRONTEND_URL || '*';

// --- CONFIG & HEALTH ---
app.set('trust proxy', 1);

console.log('--- Server Configuratie ---');
console.log('FRONTEND_URL:', frontendUrl);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('---------------------------');

app.get('/', (req, res) => {
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

app.use(express.json());

app.use(session({
    secret: 'bim-admin-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'none'
    }
}));

// --- DATABASE INIT ---
db.initDatabase().then(() => console.log('Database initialisatie gestart'));

// --- ROUTES ---
app.use('/api/auth', authRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/files', filesRouter);
app.use('/api/qr', qrRouter);
app.use('/api/public', publicRouter);
app.use('/api/admin', adminRouter);
app.use('/api', statsRouter);




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
