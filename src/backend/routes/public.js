const express = require('express');
const db = require('../database');
const router = express.Router();

// Publieke IFC Download Route
router.get('/ifc/:publicId', async (req, res) => {
    try {
        const link = await db.getPublicLink(req.params.publicId);
        if (!link) return res.status(404).json({ error: 'Ongeldige of verlopen link' });

        if (link.expires_at && new Date(link.expires_at) < new Date()) {
            return res.status(410).json({ error: 'Link is verlopen' });
        }

        const downloadUrl = await db.getFileDownloadUrl(link.files.path);

        res.json({
            modelUrl: downloadUrl,
            filename: link.files.original_name
        });
    } catch (e) {
        console.error('[PUBLIC] Fout:', e);
        res.status(500).json({ error: e.message });
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
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
