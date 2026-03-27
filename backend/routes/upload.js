const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { vereisAuthenticatie } = require('./auth');

// 1. Get Upload Ticket (Signed URL)
router.post('/ticket', vereisAuthenticatie, async (req, res) => {
    try {
        const { projectId, fileId, fileName } = req.body;

        if (!projectId || !fileName) {
            return res.status(400).json({ error: "Project ID en bestandsnaam zijn verplicht" });
        }

        // Generate or recycle ID
        const id = fileId || uuidv4();

        // Clean filename for storage
        const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const storagePath = `${projectId}/${id}_${safeName}`;

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
        console.error('Upload Ticket Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// 2. Reserve (For pre-generating QR codes)
router.post('/reserve', vereisAuthenticatie, async (req, res) => {
    try {
        const { projectId, fileName } = req.body;
        if (!projectId || !fileName) return res.status(400).json({ error: "Ontbrekende gegevens" });

        const id = uuidv4();
        // Simple clean name
        const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const storagePath = `${projectId}/${id}_${safeName}`;

        const uploadData = await db.createSignedUploadUrl(storagePath);
        if (!uploadData) return res.status(500).json({ error: "Kon link niet genereren" });

        // Create placeholder file record
        await db.createFile(id, projectId, safeName, storagePath, 0, req.session.username);

        res.json({
            fileId: id,
            uploadUrl: uploadData.signedUrl,
            storagePath: storagePath
        });

    } catch (e) {
        res.status(500).json({ error: e.message });
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
        console.error('Confirm Error:', e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
