const express = require('express');

const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
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
router.get('/:id/download', async (req, res) => {
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
                console.log(`[DOWNLOAD] Link gevonden:`, JSON.stringify(link));
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
            console.log(`[DOWNLOAD] Redirect naar: ${publicUrl}`);
            res.redirect(publicUrl);
        } else {
            console.error(`[DOWNLOAD] 404 - ID niet gevonden: ${req.params.id}`);
            res.status(404).json({ error: 'Bestand of Link niet gevonden' });
        }
    } catch (e) {
        console.error(`[DOWNLOAD] Error processing ${req.params.id}:`, e);
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
