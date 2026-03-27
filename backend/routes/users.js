const express = require('express');
const router = express.Router();
const db = require('../database');
const { vereisAuthenticatie, vereisAdmin } = require('./auth');

// List all users (alleen admins)
router.get('/', vereisAdmin, async (req, res) => {
    try {
        const users = await db.getAllUsers();
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

// Create a new user (alleen admins)
router.post('/', vereisAdmin, async (req, res) => {
    try {
        const { username, password, role } = req.body;

        if (!username || typeof username !== 'string' || username.trim().length < 2) {
            return res.status(400).json({ error: 'Gebruikersnaam moet minimaal 2 tekens zijn.' });
        }
        if (username.trim().length > 50) {
            return res.status(400).json({ error: 'Gebruikersnaam mag maximaal 50 tekens zijn.' });
        }
        if (!password || typeof password !== 'string' || password.length < 6) {
            return res.status(400).json({ error: 'Wachtwoord moet minimaal 6 tekens zijn.' });
        }

        const allowedRoles = ['admin', 'user', 'viewer'];
        const safeRole = allowedRoles.includes(role) ? role : 'user';

        const newUser = await db.createUser(username.trim(), password, safeRole);
        res.status(201).json(newUser);
    } catch (e) {
        if (e.code === '23505' || (e.message && e.message.includes('unique constraint'))) {
            return res.status(400).json({ error: 'Deze gebruikersnaam is al in gebruik.' });
        }
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden bij het aanmaken van de gebruiker.' });
    }
});

// Delete a user (alleen admins)
router.delete('/:id', vereisAdmin, async (req, res) => {
    try {
        // Voorkom verwijdering van eigen account
        if (req.params.id === req.session.userId) {
            return res.status(400).json({ error: 'Je kunt je eigen account niet verwijderen.' });
        }

        // Voorkom lockout bij laatste gebruiker
        const users = await db.getAllUsers();
        if (users.length <= 1) {
            return res.status(403).json({ error: 'Dit is de laatste gebruiker. Minimaal één gebruiker is verplicht.' });
        }

        await db.deleteUser(req.params.id);
        res.status(204).send();
    } catch (e) {
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

// Rol aanpassen (alleen admins)
router.patch('/:id/role', vereisAdmin, async (req, res) => {
    const { role } = req.body;
    const allowedRoles = ['admin', 'user', 'viewer'];

    if (!role || !allowedRoles.includes(role)) {
        return res.status(400).json({ error: `Ongeldige rol. Toegestaan: ${allowedRoles.join(', ')}` });
    }

    try {
        const updated = await db.updateUserProfile(req.params.id, { role });
        if (!updated) return res.status(404).json({ error: 'Gebruiker niet gevonden.' });
        res.json({ message: 'Rol bijgewerkt', user: updated });
    } catch (e) {
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

// Account in-/uitschakelen (alleen admins)
router.patch('/:id/disabled', vereisAdmin, async (req, res) => {
    const { disabled } = req.body;

    if (typeof disabled !== 'boolean') {
        return res.status(400).json({ error: 'disabled moet true of false zijn.' });
    }

    // Voorkom blokkering van eigen account
    if (req.params.id === req.session.userId && disabled) {
        return res.status(400).json({ error: 'Je kunt je eigen account niet uitschakelen.' });
    }

    try {
        const updated = await db.updateUserProfile(req.params.id, { disabled });
        if (!updated) return res.status(404).json({ error: 'Gebruiker niet gevonden.' });
        res.json({ message: disabled ? 'Account uitgeschakeld' : 'Account ingeschakeld', user: updated });
    } catch (e) {
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

// Wachtwoord resetten als admin (zonder oud wachtwoord te vereisen)
router.patch('/:id/reset-password', vereisAdmin, async (req, res) => {
    const { password } = req.body;

    if (!password || typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ error: 'Nieuw wachtwoord moet minimaal 6 tekens zijn.' });
    }

    try {
        const updated = await db.updateUserProfile(req.params.id, { password });
        if (!updated) return res.status(404).json({ error: 'Gebruiker niet gevonden.' });
        res.json({ message: 'Wachtwoord gereset' });
    } catch (e) {
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

module.exports = router;
