const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { vereisAuthenticatie } = require('./auth');

// 1. Get Upload Ticket (Signed URL)
router.post('/ticket', vereisAuthenticatie, async (req, res) => {
    try {
        const { projectId, fileName } = req.body;

        if (!projectId || !fileName) {
            return res.status(400).json({ error: "Project ID en bestandsnaam zijn verplicht" });
        }

        // Clean filename for storage
        const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        // Reuse the record and Storage path for a matching filename. The
        // signed upload URL is upsert-enabled, so this is a real overwrite
        // instead of a second file appearing in the website.
        const existing = await db.getFileByProjectAndName(projectId, safeName);
        const id = existing?.id || uuidv4();
        const storagePath = existing?.path || `${projectId}/${id}_${safeName}`;

        // Get Signed URL from Supabase
        const uploadData = await db.createSignedUploadUrl(storagePath);

        if (!uploadData) {
            return res.status(500).json({ error: "Kon geen upload link genereren" });
        }

        res.json({
            fileId: id,
            uploadUrl: uploadData.signedUrl,
            storagePath: storagePath
        });

    } catch (e) {
        console.error('[Upload] Ticket fout:', e);
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

// 2. Reserve (For pre-generating QR codes)
router.post('/reserve', vereisAuthenticatie, async (req, res) => {
    try {
        const { projectId, fileName } = req.body;
        if (!projectId || !fileName) return res.status(400).json({ error: "Ontbrekende gegevens" });

        // Simple clean name
        const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const existing = await db.getFileByProjectAndName(projectId, safeName);
        const id = existing?.id || uuidv4();
        const storagePath = existing?.path || `${projectId}/${id}_${safeName}`;

        const uploadData = await db.createSignedUploadUrl(storagePath);
        if (!uploadData) return res.status(500).json({ error: "Kon link niet genereren" });

        // Create a placeholder only for a new name; an existing file is
        // overwritten in place and must retain its file ID/public links.
        if (!existing) {
            await db.createFile(id, projectId, safeName, storagePath, 0, req.session.username);
        }

        res.json({
            fileId: id,
            uploadUrl: uploadData.signedUrl,
            storagePath: storagePath
        });

    } catch (e) {
        console.error('[Upload] Reserve fout:', e);
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

// 3. Confirm Upload
router.post('/confirm', vereisAuthenticatie, async (req, res) => {
    try {
        const { fileId, projectId, fileName, fileSize, storagePath } = req.body;

        // Check if file exists (if reserved)
        const existing = await db.getFileById(fileId);

        if (existing) {
            // Update size and date
            await db.updateFile(fileId, {
                size: fileSize,
                upload_date: new Date().toISOString()
            });
        } else {
            // Create new
            await db.createFile(fileId, projectId, fileName, storagePath, fileSize, req.session.username);
        }

        res.json({ status: 'ok', fileId });
    } catch (e) {
        console.error('[Upload] Confirm fout:', e);
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

module.exports = router;
