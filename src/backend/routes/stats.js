const express = require('express');
const db = require('../database');
const { vereisAuthenticatie } = require('./auth');
const router = express.Router();

router.get('/statistics', vereisAuthenticatie, async (req, res) => {
    try {
        const stats = await db.getStatistics();
        res.json(stats);
    } catch (e) {
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden bij het ophalen van statistieken.' });
    }
});

router.get('/statistics/detailed', vereisAuthenticatie, async (req, res) => {
    try {
        const stats = await db.getDetailedStatistics();
        res.json(stats);
    } catch (e) {
        res.status(500).json({ error: 'Fout bij het ophalen van gedetailleerde statistieken.' });
    }
});

router.post('/statistics/reset', vereisAuthenticatie, async (req, res) => {
    try {
        await db.resetScanActivity();
        res.json({ success: true, message: 'Scan statistieken gereset.' });
    } catch (e) {
        res.status(500).json({ error: 'Fout bij het resetten van statistieken.' });
    }
});

router.get('/activity', vereisAuthenticatie, async (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    try {
        const activity = await db.getRecentActivity(limit);
        res.json(activity);
    } catch (e) {
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden bij het ophalen van activiteit.' });
    }
});

// QR CRUD (ook admin/beheer gerelateerd, maar past hier of in admin.js)
// We zetten het hier bij "beheer" functies
router.get('/qr', vereisAuthenticatie, async (req, res) => res.json(await db.getAllQRCodes()));

router.delete('/qr/:id', vereisAuthenticatie, async (req, res) => {
    await db.deleteQRCode(req.params.id);
    res.status(204).send();
});

module.exports = router;
