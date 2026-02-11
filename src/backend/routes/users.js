const express = require('express');
const router = express.Router();
const db = require('../database');
const { vereisAuthenticatie } = require('./auth');

// List all users
router.get('/', vereisAuthenticatie, async (req, res) => {
    try {
        const users = await db.getAllUsers();
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Create a new user
router.post('/', vereisAuthenticatie, async (req, res) => {
    try {
        const { username, password, role } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Gebruikersnaam en wachtwoord zijn verplicht.' });
        }

        const newUser = await db.createUser(username, password, role || 'user');
        res.status(201).json(newUser);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete a user
router.delete('/:id', vereisAuthenticatie, async (req, res) => {
    try {
        // Check if user is 'admin'
        // Check total user count to prevent lockout
        const users = await db.getAllUsers();
        if (users.length <= 1) {
            return res.status(403).json({ error: 'Dit is de laatste gebruiker. Je kunt minimaal één gebruiker niet verwijderen.' });
        }

        await db.deleteUser(req.params.id);
        res.status(204).send();
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
