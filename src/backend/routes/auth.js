const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database');
const router = express.Router();

// Middleware voor authenticatie
const vereisAuthenticatie = (req, res, next) => {
    if (req.session && req.session.userId) next();
    else res.status(401).json({ error: 'Authenticatie vereist' });
};

// LOGIN Route
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    console.log(`[LOGIN] Poging voor gebruiker: ${username}`);

    try {
        const user = await db.getUserByUsername(username);
        console.log(`[LOGIN] Gebruiker gevonden:`, user ? 'JA' : 'NEE');

        if (user && bcrypt.compareSync(password, user.password_hash)) {
            req.session.userId = user.id;
            console.log(`[LOGIN] Succes! Sessie ID: ${req.session.id}`);
            res.json({ message: 'OK', user: { id: user.id, username: user.username } });
        } else {
            console.log(`[LOGIN] Mislukt - Ongeldige gegevens`);
            res.status(401).json({ error: 'Inloggen mislukt' });
        }
    } catch (e) {
        console.error(`[LOGIN] Fout:`, e);
        res.status(500).json({ error: 'Server fout bij inloggen' });
    }
});

// LOGOUT Route (Optioneel, voor de volledigheid)
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
        res.status(500).json({ error: e.message });
    }
});

module.exports = { router, vereisAuthenticatie };
