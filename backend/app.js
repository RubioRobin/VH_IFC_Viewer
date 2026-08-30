const path = require('path');
try {
    require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (e) {
    console.log('Dotenv niet geladen (waarschijnlijk productie-omgeving)');
}
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const session = require('express-session');
const db = require('./database');

// Routes
const { router: authRouter } = require('./routes/auth');
const projectsRouter = require('./routes/projects');
const { router: filesRouter } = require('./routes/files');
const uploadRouter = require('./routes/upload');
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
const rateLimit = require('express-rate-limit');
const createSupabaseSessionStore = require('./services/session-store');
const app = express();
const port = process.env.PORT || 3001;

// --- CONFIG ---
// The API may run behind one trusted reverse proxy in production.
app.set('trust proxy', 1);
const frontendUrl = process.env.FRONTEND_URL || '*';

// --- SECURITY MIDDLEWARE ---
app.use(helmet({
    contentSecurityPolicy: false, // Allow inline scripts/styles for now to avoid breaking existing UI
    crossOriginResourcePolicy: { policy: "cross-origin" } // Allow file downloads
}));
app.use(xss());

// --- RATE LIMITING ---
// Strikt limiet voor inlog-endpoints (bescherming tegen brute-force)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minuten
    max: 10,                   // max 10 pogingen per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Te veel inlogpogingen. Probeer het over 15 minuten opnieuw.' }
});

// Normaal limiet voor overige API-endpoints
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Te veel verzoeken. Probeer het later opnieuw.' }
});

// Publiek limiet voor deellinks en downloads (hogere drempel voor viewers)
const publicLimiter = rateLimit({
    windowMs: 60 * 1000,       // 1 minuut
    max: 60,                   // max 60 verzoeken per minuut
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Te veel verzoeken. Probeer het later opnieuw.' }
});

// Basisstatus endpoint
app.get('/', (req, res) => {
    res.send('VH IFC Viewer Backend is ONLINE! 🚀');
});

app.get('/api/health', async (req, res) => {
    let dbStatus = 'not_initialized';
    let dbError = null;
    if (db.supabase) {
        try {
            const { data, error } = await db.supabase.from('users').select('count').limit(1);
            dbStatus = error ? 'error' : 'ok';
            if (error) dbError = error.message;
        } catch (e) {
            dbStatus = 'error';
            dbError = e.message;
        }
    }
    res.json({ status: 'ok', timestamp: new Date().toISOString(), db: dbStatus, dbError });
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
            callback(new Error('Niet toegestaan door CORS'));
        }
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10kb' })); // Body limit against DoS

const isProduction = process.env.NODE_ENV === 'production';

// Veiligheidscheck: SESSION_SECRET is verplicht in productie
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret && isProduction) {
    console.error('❌ KRITIEK: SESSION_SECRET is niet ingesteld in productie-omgeving! Applicatie stopt.');
    process.exit(1);
}

// Gebruik Supabase-backed session store in productie zodat sessies een herstart overleven.
// In development (geen Supabase) valt het terug op in-memory store.
const sessionStore = db.supabase ? createSupabaseSessionStore(db.supabase) : undefined;

app.use(session({
    secret: sessionSecret || 'lokale-dev-secret-niet-voor-productie',
    resave: false,
    saveUninitialized: false,
    proxy: isProduction,
    store: sessionStore,
    cookie: {
        secure: isProduction, // Beveiligd vereist HTTPS
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: isProduction ? 'none' : 'lax' // 'none' vereist voor cross-site (frontend <-> backend)
    }
}));

// --- DATABASE INIT ---
db.initDatabase().then(() => console.log('Database initialisatie gestart'));

// --- ROUTES ---
app.use('/api/auth', loginLimiter, authRouter);    // Strikt limiet op auth
app.use('/api/plugin', apiLimiter, pluginRouter);   // Normaal limiet — login endpoint heeft eigen limiter via plugin.js
app.use('/api/share', publicLimiter, shareRouter);  // Publiek limiet op deellinks
app.use('/api/public', publicLimiter, publicRouter);
app.use('/api/projects', apiLimiter, projectsRouter);
app.use('/api/files', apiLimiter, filesRouter);
app.use('/api/upload', apiLimiter, uploadRouter);
app.use('/api/qr', apiLimiter, qrRouter);
app.use('/api/users', apiLimiter, usersRouter);
app.use('/api/admin', apiLimiter, adminRouter);
app.use('/api/debug', apiLimiter, debugRouter);
app.use('/api', apiLimiter, statsRouter);




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
