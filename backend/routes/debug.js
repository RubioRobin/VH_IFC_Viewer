const express = require('express');
const db = require('../database');
const { vereisAuthenticatie } = require('./auth');
const router = express.Router();

// Debugfunctie: controleer of de admin-gebruiker bestaat (ALLEEN VOOR BEHEERDERS)
router.get('/check-admin', vereisAuthenticatie, async (req, res) => {
    try {
        const user = await db.getUserByUsername('admin');
        if (user) {
            res.json({
                exists: true,
                username: user.username,
                hasValidHash: user.password_hash && user.password_hash.length > 50
            });
        } else {
            res.json({ exists: false });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Admin reset - uitgeschakeld om veiligheidsredenen
router.post('/reset-admin', async (req, res) => {
    res.status(403).json({ error: 'Deze functie is uitgeschakeld om veiligheidsredenen.' });
});

module.exports = router;
