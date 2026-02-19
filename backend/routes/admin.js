const express = require('express');
const router = express.Router();
const { vereisAuthenticatie } = require('./auth');

// Check Session logic
router.get('/me', vereisAuthenticatie, async (req, res) => {
    // If middleware passes, user is logged in
    res.json({
        authenticated: true,
        user: { id: req.session.userId, username: 'admin' }
    });
});

module.exports = router;
