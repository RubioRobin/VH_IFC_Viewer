const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { vereisAuthenticatie } = require('./auth');
const router = express.Router();

// Haal alle projecten op
router.get('/', vereisAuthenticatie, async (req, res) => {
    try {
        const projects = await db.getAllProjects();
        res.json(projects);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Haal specifiek project op
router.get('/:id', vereisAuthenticatie, async (req, res) => {
    try {
        const project = await db.getProjectById(req.params.id);
        if (project) res.json(project);
        else res.status(404).json({ error: "Project niet gevonden" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Maak nieuw project
router.post('/', vereisAuthenticatie, async (req, res) => {
    const { name, description, status } = req.body;
    try {
        const newProject = await db.createProject(uuidv4(), name, description || '', status || 'active');
        res.status(201).json(newProject);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update project
router.put('/:id', vereisAuthenticatie, async (req, res) => {
    try {
        const updated = await db.updateProject(req.params.id, req.body);
        if (updated) res.json(updated);
        else res.status(404).json({ error: "Project niet gevonden" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Verwijder project
router.delete('/:id', vereisAuthenticatie, async (req, res) => {
    try {
        await db.deleteProject(req.params.id);
        res.status(204).send();
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- FILE ROUTES (Project Specifiek) ---
const { upload } = require('./files'); // Importeer upload config van files.js
const fs = require('fs');

// Haal bestanden van project op
router.get('/:id/files', vereisAuthenticatie, async (req, res) => {
    try {
        const projectFiles = await db.getFilesByProjectId(req.params.id);
        res.json(projectFiles);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Upload bestand naar project
router.post('/:id/upload', vereisAuthenticatie, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Geen bestand geupload' });

    try {
        const { v4: uuidv4 } = require('uuid');
        const path = require('path');

        const newFile = await db.createFile(
            uuidv4(),
            req.params.id,
            req.file.filename,
            req.file.originalname,
            req.file.size,
            path.extname(req.file.originalname).replace('.', ''), // Extensie zonder punt
            req.file.path
        );

        // Opruimen
        fs.unlink(req.file.path, (err) => {
            if (err) console.error('Fout bij opruimen temp bestand:', err);
        });

        // Log Activiteit
        if (req.session.userId) {
            await db.logActivity(req.params.id, 'Admin', 'upload', `Bestand ${newFile.original_name} geupload`);
        }

        res.status(201).json(newFile);
    } catch (e) {
        console.error('Upload fout:', e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
