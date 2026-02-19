const express = require('express');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { vereisAuthenticatie } = require('./auth');

const router = express.Router();

// Ensure QR codes directory exists
const qrDir = path.join(__dirname, '..', 'qr-codes');
if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir, { recursive: true });

// Haal alle QR codes op (Admin) - GEBRUIKT DOOR ADMIN DASHBOARD
router.get('/', vereisAuthenticatie, async (req, res) => {
    try {
        const qrs = await db.getAllQRCodes(); // Zorg dat deze functie bestaat in database.js!
        res.json(qrs);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Genereer QR Code - GEBRUIKT DOOR REVIT PLUGIN EN DASHBOARD
router.post('/generate', async (req, res) => {
    // Note: Revit Plugin authentication might be specific. 
    // For now we allow authenticated users (like Admin or Plugin session)
    // If Plugin fails, we might need to relax auth or use API Key.
    // Plugin sends cookie, so simple session check "conceptually" works IF plugin logged in.

    // Check Auth (Plugin logs in first, so req.session.userId should be set)
    if (!req.session || !req.session.userId) {
        // console.log('[QR] Unauthorized access attempt');
        // return res.status(401).json({ error: 'Niet ingelogd' });
        // DEV: Allow public generation? No, security risk.
        // Plugin does login in lines 209-243 of Command.cs! So we are good.
    }
    // Double check auth
    if (!req.session.userId) return res.status(401).json({ error: 'Niet ingelogd' });

    const { project_id, file_id, element_id } = req.body;

    if (!project_id || !file_id || !element_id) {
        return res.status(400).json({ error: 'Ontbrekende parameters' });
    }

    try {
        // Create Public Link (Active)
        const publicLink = await db.createPublicLink(project_id, file_id, req.session.username);
        const publicId = publicLink.public_id;

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        // Use publicId instead of file_id
        const publicUrl = `${frontendUrl}/v/${publicId}?element=${element_id}`;

        /*
        // LEGACY URL (Direct File ID)
        // const publicUrl = `${frontendUrl}/v/${file_id}?element=${element_id}`;
        */

        const qrId = uuidv4();
        const filePath = path.join(qrDir, `${qrId}.png`);

        await QRCode.toFile(filePath, publicUrl);

        // Save to DB
        await db.createQRCode(qrId, project_id, file_id, element_id, publicUrl, filePath);

        // Return relative path for Plugin to download
        res.json({
            qr_image_url: `/qr-codes/${qrId}.png`,
            qr_id: qrId,
            public_url: publicUrl
        });

    } catch (e) {
        console.error('QR-gegenereer fout:', e);
        res.status(500).json({ error: 'Kon QR-code niet genereren: ' + e.message });
    }
});



// Delete QR
router.delete('/:id', vereisAuthenticatie, async (req, res) => {
    try {
        await db.deleteQRCode(req.params.id);
        const filePath = path.join(qrDir, `${req.params.id}.png`);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.status(204).send();
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
