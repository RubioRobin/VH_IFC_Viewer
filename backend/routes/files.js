const express = require('express');
const db = require('../database');
const { vereisAuthenticatie } = require('./auth');

const router = express.Router();



// Haal alle bestanden op (Admin of Project specifiek)
router.get('/', vereisAuthenticatie, async (req, res) => {
    try {
        if (req.query.projectId) {
            const files = await db.getFilesByProjectId(req.query.projectId);
            res.json(files);
        } else {
            const files = await db.getAllFiles();
            res.json(files);
        }
    } catch (e) {
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});



// Download redirect (Supports File ID OR Public Link ID)
router.get('/:id/download', vereisAuthenticatie, async (req, res) => {
    try {
        let publicUrl;

        // 1. Try as File ID
        const file = await db.getFileById(req.params.id);
        if (file) {
            publicUrl = await db.getFileDownloadUrl(file.path);
        } else {
            // 2. Try as Public Link ID (Fallback)
            const link = await db.getPublicLink(req.params.id);
            if (link) {
                // Handle Supabase foreign key response (could be object or array)
                const fileData = Array.isArray(link.files) ? link.files[0] : link.files;

                if (fileData && fileData.path) {
                    publicUrl = await db.getFileDownloadUrl(fileData.path);
                } else {
                    console.error('[DOWNLOAD] Link gevonden maar geen bestand gekoppeld:', link);
                }
            }
        }

        if (publicUrl) {
            res.redirect(publicUrl);
        } else {
            res.status(404).json({ error: 'Bestand of Link niet gevonden' });
        }
    } catch (e) {
        console.error(`[DOWNLOAD] Error processing ${req.params.id}:`, e);
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

// Geeft Supabase signed URL terug als JSON (voor dashboard download)
router.get('/:id/signed-url', vereisAuthenticatie, async (req, res) => {
    try {
        const file = await db.getFileById(req.params.id);
        if (!file) return res.status(404).json({ error: 'Bestand niet gevonden' });
        const url = await db.getFileDownloadUrl(file.path);
        if (!url) return res.status(500).json({ error: 'Kon download URL niet genereren' });
        res.json({ url, filename: file.filename });
    } catch (e) {
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

// Verwijder bestand
router.delete('/:id', vereisAuthenticatie, async (req, res) => {
    try {
        const file = await db.getFileById(req.params.id);
        if (file) {
            await db.deleteFile(req.params.id);
            res.status(204).send();
        } else {
            res.status(404).json({ error: "Bestand niet gevonden" });
        }
    } catch (e) {
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

module.exports = { router }; 
