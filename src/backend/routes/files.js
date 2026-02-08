const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { vereisAuthenticatie } = require('./auth');

const router = express.Router();

// Upload Configuratie
const uploadsDir = path.join(__dirname, '..', 'uploads'); // Relative to routes folder
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadsDir),
        filename: (req, file, cb) => {
            const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
            cb(null, `${uuidv4()}-${cleanName}`);
        }
    })
});

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
        res.status(500).json({ error: e.message });
    }
});

// Upload Bestand (Direct endpoint)
router.post('/', vereisAuthenticatie, upload.single('ifcFile'), async (req, res) => {
    try {
        console.log(`[UPLOAD] Start upload`);
        if (!req.file) return res.status(400).json({ error: 'Geen bestand ontvangen' });

        const { projectId } = req.body;
        console.log(`[UPLOAD] Bestand: ${req.file.originalname} voor Project: ${projectId}`);

        const newFile = await db.createFile(null, projectId, req.file.filename, req.file.originalname, req.file.size, 'ifc', req.file.path);

        // Verwijder temp bestand
        fs.unlink(req.file.path, (err) => {
            if (err) console.error('Fout bij opruimen temp bestand:', err);
        });

        console.log(`[UPLOAD] Succes: ${newFile.id}`);
        res.json(newFile);
    } catch (e) {
        console.error(`[UPLOAD] Fout:`, e);
        res.status(500).json({ error: e.message });
    }
});

// Download redirect
router.get('/:id/download', async (req, res) => {
    try {
        const file = await db.getFileById(req.params.id);
        if (!file) return res.status(404).json({ error: 'Bestand niet gevonden' });

        const publicUrl = await db.getFileDownloadUrl(file.path);

        if (publicUrl) {
            console.log(`[DOWNLOAD] Redirect naar: ${publicUrl}`);
            res.redirect(publicUrl);
        } else {
            res.status(404).json({ error: 'Bestand niet gevonden in opslag' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
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
        res.status(500).json({ error: e.message });
    }
});

module.exports = { router, upload }; 
