const express = require('express');
const db = require('../database');
const router = express.Router();

const { getShareByShareId } = require('../services/database-helpers');
const { generateSignedDownloadUrl } = require('../services/supabase-admin');

// Publieke IFC Download Route
router.get('/ifc/:publicId', async (req, res) => {
    try {
        let modelUrl, filename;

        // 1. Try New Share System (for Revit Plugin & Manual Uploads)
        const share = await getShareByShareId(req.params.publicId);
        if (share) {
            if (share.expires_at && new Date(share.expires_at) < new Date()) {
                return res.status(410).json({ error: 'Link is verlopen' });
            }
            if (!share.revision || share.revision.status !== 'ready') {
                return res.status(503).json({ error: 'Model is nog niet klaar', status: share.revision?.status });
            }

            modelUrl = await generateSignedDownloadUrl(
                'ifc-private',
                share.revision.storage_path,
                900 // 15 minutes
            );
            filename = share.revision.file_name;

            return res.json({ modelUrl, filename });
        }

        // 2. Try Legacy Public Link
        const link = await db.getPublicLink(req.params.publicId);
        if (link) {
            // Logic for Public Link
            if (link.expires_at && new Date(link.expires_at) < new Date()) {
                return res.status(410).json({ error: 'Link is verlopen' });
            }
            modelUrl = await db.getFileDownloadUrl(link.files.path);
            filename = link.files.original_name;
        } else {
            // 3. Fallback: Try direct File ID (for Legacy/Admin QR codes)
            const file = await db.getFileById(req.params.publicId);
            if (!file) return res.status(404).json({ error: 'Ongeldige link of bestand niet gevonden' });

            modelUrl = await db.getFileDownloadUrl(file.path);
            filename = file.original_name;
        }

        res.json({
            modelUrl: modelUrl,
            filename: filename
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
