const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { vereisAuthenticatie } = require('./auth');

const fs = require('fs');
const router = express.Router();

// Haal alle projecten op
router.get('/', vereisAuthenticatie, async (req, res) => {
    try {
        const projects = await db.getAllProjects();
        res.json(projects);
    } catch (e) {
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

// Haal specifiek project op
router.get('/:id', vereisAuthenticatie, async (req, res) => {
    try {
        const project = await db.getProjectById(req.params.id);
        if (project) res.json(project);
        else res.status(404).json({ error: "Project niet gevonden" });
    } catch (e) {
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

// Maak nieuw project
router.post('/', vereisAuthenticatie, async (req, res) => {
    const { name, description, status } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Projectnaam is verplicht.' });
    }
    if (name.trim().length > 200) {
        return res.status(400).json({ error: 'Projectnaam mag maximaal 200 tekens zijn.' });
    }

    const allowedStatuses = ['actief', 'in-uitvoering', 'on-hold', 'planning', 'afgerond'];
    const safeStatus = allowedStatuses.includes(status) ? status : 'actief';

    try {
        const newProject = await db.createProject(uuidv4(), name.trim(), (description || '').slice(0, 1000), safeStatus, req.session.username);
        res.status(201).json(newProject);
    } catch (e) {
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

// Update project
router.put('/:id', vereisAuthenticatie, async (req, res) => {
    const { name, description } = req.body;

    if (name !== undefined) {
        if (typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({ error: 'Projectnaam mag niet leeg zijn.' });
        }
        if (name.trim().length > 200) {
            return res.status(400).json({ error: 'Projectnaam mag maximaal 200 tekens zijn.' });
        }
    }

    const cleanBody = {};
    if (name) cleanBody.name = name.trim();
    if (description !== undefined) cleanBody.description = (description || '').slice(0, 1000);

    try {
        const updated = await db.updateProject(req.params.id, cleanBody);
        if (updated) res.json(updated);
        else res.status(404).json({ error: "Project niet gevonden" });
    } catch (e) {
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

// Update project status
router.patch('/:id/status', vereisAuthenticatie, async (req, res) => {
    const { status } = req.body;
    const allowedStatuses = ['actief', 'in-uitvoering', 'on-hold', 'planning', 'afgerond'];

    if (!status || !allowedStatuses.includes(status)) {
        return res.status(400).json({ error: 'Ongeldige status' });
    }

    try {
        const updated = await db.updateProjectStatus(req.params.id, status, req.session.username);
        if (updated) res.json(updated);
        else res.status(404).json({ error: "Project niet gevonden" });
    } catch (e) {
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

// Verwijder project
router.delete('/:id', vereisAuthenticatie, async (req, res) => {
    try {
        await db.deleteProject(req.params.id);
        res.status(204).send();
    } catch (e) {
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

// --- MODEL ROUTES (New Flow with Revit Plugin) ---

// Get all models for a project
router.get('/:id/models', vereisAuthenticatie, async (req, res) => {
    try {
        const models = await db.getModelsByProjectId(req.params.id);
        res.json(models);
    } catch (e) {
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

// Upload initieren voor een specifieke model-revisie.
// Geeft een ondertekende Supabase upload-URL terug zodat de frontend direct kan uploaden.
// Na de upload: gebruik /api/upload/confirm om de bestandsregistratie af te ronden.
router.post('/:id/models/:modelId/revisions/:revId/upload', vereisAuthenticatie, async (req, res) => {
    const { id: projectId, modelId, revId } = req.params;
    const { fileName } = req.body;

    if (!fileName) {
        return res.status(400).json({ error: 'Bestandsnaam (fileName) is verplicht.' });
    }

    try {
        // Controleer of het model bij dit project hoort
        const models = await db.getModelsByProjectId(projectId);
        const model = (models || []).find(m => m.id === modelId);
        if (!model) {
            return res.status(404).json({ error: 'Model niet gevonden in dit project.' });
        }

        const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const storagePath = `revit_exports/${modelId}/${revId}_${safeName}`;

        const uploadData = await db.createSignedUploadUrl(storagePath);
        if (!uploadData) {
            return res.status(500).json({ error: 'Kon geen upload-URL genereren.' });
        }

        res.json({
            success: true,
            uploadUrl: uploadData.signedUrl,
            storagePath,
            fileId: revId,
            message: 'Upload-URL gegenereerd. Upload het bestand en roep daarna /api/upload/confirm aan.'
        });
    } catch (e) {
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});



// --- FILE ROUTES (Legacy / Simple Upload) ---
// const { upload } = require('./files'); // Moved to top
// const fs = require('fs'); // Moved to top

// Haal bestanden van project op
router.get('/:id/files', vereisAuthenticatie, async (req, res) => {
    try {
        const projectFiles = await db.getFilesByProjectId(req.params.id);
        res.json(projectFiles);
    } catch (e) {
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});



module.exports = router;
