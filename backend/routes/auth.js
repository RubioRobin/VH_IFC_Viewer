const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database');
const router = express.Router();

// Middleware: vereist dat de gebruiker is ingelogd
const vereisAuthenticatie = (req, res, next) => {
    // 1. Session check
    if (req.session && req.session.userId) return next();

    // 2. API Key check (for scripts/testing)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        if (process.env.ADMIN_API_KEY && token === process.env.ADMIN_API_KEY) {
            if (!req.session) req.session = {};
            req.session.userId = 'admin-api-user';
            req.session.username = 'API Admin';
            req.session.role = 'admin';
            return next();
        }
    }

    res.status(401).json({ error: 'Authenticatie vereist' });
};

// Middleware: vereist admin-rol
const vereisAdmin = async (req, res, next) => {
    // Eerst authenticatie-check
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Authenticatie vereist' });
    }

    // API key gebruikers zijn altijd admin
    if (req.session.userId === 'admin-api-user') return next();

    // Gebruik de rol die bij login in de sessie is opgeslagen
    const role = req.session.role;
    if (role === 'admin') return next();

    // Fallback: haal rol op uit database (als sessie geen rol bevat)
    try {
        const user = await db.getUserById(req.session.userId);
        if (user && user.role === 'admin') return next();
    } catch (e) {
        // Stil falen
    }

    res.status(403).json({ error: 'Adminrechten vereist voor deze actie' });
};

// LOGIN Route
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    console.log(`[LOGIN] Poging voor gebruiker: ${username}`);

    try {
        const user = await db.getUserByUsername(username);
        console.log(`[LOGIN] Gebruiker gevonden:`, user ? 'JA' : 'NEE');

        if (user && !user.disabled && await bcrypt.compare(password, user.password_hash)) {
            req.session.userId = user.id;
            req.session.username = user.username;
            req.session.role = user.role || 'user';
            console.log(`[LOGIN] Succes! Sessie ID: ${req.session.id}, Rol: ${req.session.role}`);
            res.json({ message: 'OK', user: { id: user.id, username: user.username, role: user.role || 'user' } });
        } else if (user && user.disabled) {
            console.log(`[LOGIN] Mislukt - Account uitgeschakeld`);
            res.status(403).json({ error: 'Account is uitgeschakeld. Neem contact op met een beheerder.' });
        } else {
            console.log(`[LOGIN] Mislukt - Ongeldige gegevens`);
            res.status(401).json({ error: 'Inloggen mislukt' });
        }
    } catch (e) {
        console.error(`[LOGIN] Fout:`, e);
        res.status(500).json({ error: 'Server fout bij inloggen' });
    }
});

// CHECK AUTH Route (Backend-side verification for Frontend)
router.get('/me', vereisAuthenticatie, async (req, res) => {
    // If middleware passes, user is basically authenticated
    // But we should fetch fresh user data to be safe/sure
    try {
        let userId = req.session.userId;

        // Handle API Key mock user
        if (userId === 'admin-api-user') {
            return res.json({ id: 'admin-api', username: 'API Admin', role: 'admin' });
        }

        const user = await db.getUserById(userId);
        if (user) {
            res.json({
                id: user.id,
                username: user.username,
                role: user.role || 'admin',
                email: user.email,
                avatar_url: user.avatar_url
            });
        } else {
            res.status(401).json({ error: 'Sessie ongeldig (gebruiker niet gevonden)' });
        }
    } catch (e) {
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

// UPDATE PROFILE Route
router.put('/profile', vereisAuthenticatie, async (req, res) => {
    try {
        const userId = req.session.userId;
        const { username, email, password, avatar_url } = req.body;

        // Validations can be added here (e.g. check if username unique if changed)

        const updatedUser = await db.updateUserProfile(userId, {
            username,
            email,
            password,
            avatar_url
        });

        res.json({ message: 'Profiel bijgewerkt', user: updatedUser });
    } catch (e) {
        console.error('Update profile error:', e);
        if (e.code === '23505' || (e.message && e.message.includes('unique constraint'))) {
            return res.status(400).json({ error: 'Deze gebruikersnaam is al in gebruik.' });
        }
        res.status(500).json({ error: 'Kon profiel niet bijwerken. Probeer het later opnieuw.' });
    }
});

// LOGOUT Route
router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ error: 'Uitloggen mislukt' });
        res.clearCookie('connect.sid');
        res.json({ message: 'Uitgelogd' });
    });
});

// GEBRUIKERS Route
router.get('/users', vereisAuthenticatie, async (req, res) => {
    try {
        const users = await db.getAllUsers();
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

module.exports = { router, vereisAuthenticatie, vereisAdmin };
