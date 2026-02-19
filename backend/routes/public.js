const express = require('express');
const db = require('../database');
const router = express.Router();

// Publieke IFC Download Route
router.get('/ifc/:publicId', async (req, res) => {
    try {
        let modelUrl, filename;

        // 1. Try Legacy Public Link
        const link = await db.getPublicLink(req.params.publicId);
        if (link) {
            // Logic for Public Link
            if (link.expires_at && new Date(link.expires_at) < new Date()) {
                return res.status(410).json({ error: 'Link is verlopen' });
            }
            modelUrl = await db.getFileDownloadUrl(link.files.path);
            filename = link.files.filename;
        } else {
            // 2. Fallback: Try direct File ID
            const file = await db.getFileById(req.params.publicId);
            if (!file) return res.status(404).json({ error: 'Ongeldige link of bestand niet gevonden' });

            modelUrl = await db.getFileDownloadUrl(file.path);
            filename = file.filename;

            // Log scan activity
            await db.logActivity(file.project_id, 'Guest', 'scan', `Direct Scan: ${filename}`, file.id);
        }

        if (link) {
            // Log scan activity for link
            await db.logActivity(link.project_id, 'Guest', 'scan', `QR Scan: ${link.files?.filename || 'Unknown'}`, link.ifc_file_id);
        }

        res.json({
            modelUrl: modelUrl,
            filename: filename
        });
    } catch (e) {
        console.error('[PUBLIC] Fout:', e);
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

// QR Resolve Route (Legacy support)
router.get('/resolve/:elementId', async (req, res) => {
    try {
        const qrs = await db.getAllQRCodes();
        const qr = qrs.find(q => q.element_id === req.params.elementId);
        if (!qr) return res.status(404).json({ error: 'Niet gevonden' });

        const file = await db.getFileById(qr.file_id);
        if (!file) return res.status(404).json({ error: 'Bestand niet gevonden' });

        const publicUrl = await db.getFileDownloadUrl(file.path);

        res.json({ file_url: publicUrl, element_id: qr.element_id });
    } catch (e) {
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

module.exports = router;
