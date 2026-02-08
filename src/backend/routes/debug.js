const express = require('express');
const db = require('../database');
const router = express.Router();

// Debug endpoint to check if admin user exists
router.get('/check-admin', async (req, res) => {
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

// Force recreate admin user
router.post('/reset-admin', async (req, res) => {
    try {
        const bcrypt = require('bcryptjs');
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        // Delete existing admin
        await supabase.from('users').delete().eq('username', 'admin');

        // Create new admin
        const { data, error } = await supabase.from('users').insert([{
            id: 'admin-1',
            username: 'admin',
            password_hash: bcrypt.hashSync('admin123', 10),
            role: 'admin'
        }]).select().single();

        if (error) throw error;

        res.json({ success: true, user: { username: data.username, id: data.id } });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
