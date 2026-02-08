const express = require('express');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const path = require('path');
const db = require('../database');
const { vereisAuthenticatie } = require('./auth');
const router = express.Router();

// QR Codes Opslagmap
const qrCodesDir = path.join(__dirname, '..', 'qr-codes');

// Genereer Publieke Link & QR
router.post('/public-link', vereisAuthenticatie, async (req, res) => {
    try {
        const { project_id, file_id } = req.body;
        const link = await db.createPublicLink(project_id, file_id);

        const baseUrl = process.env.FRONTEND_URL && process.env.FRONTEND_URL !== '*'
            ? process.env.FRONTEND_URL
            : 'http://localhost:5173';

        const viewerUrl = `${baseUrl}/v/${link.public_id}`;

        // QR Generatie
        const qrId = uuidv4();
        const qrFileName = `qr-${qrId}.png`;
        const qrPath = path.join(qrCodesDir, qrFileName);

        await QRCode.toFile(qrPath, viewerUrl);

        res.status(201).json({
            ...link,
            viewerUrl,
            qrImageUrl: `/qr-codes/${qrFileName}`
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
