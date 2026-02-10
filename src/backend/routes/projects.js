const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { vereisAuthenticatie } = require('./auth');
const { upload } = require('./files'); // Importeer upload config van files.js
const fs = require('fs');
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

// --- MODEL ROUTES (New Flow with Revit Plugin) ---

// Get all models for a project
router.get('/:id/models', vereisAuthenticatie, async (req, res) => {
    try {
        const models = await db.getModelsByProjectId(req.params.id);
        res.json(models);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Manual Upload to a reserved revision (Admin Dashboard)
router.post('/:id/models/:modelId/revisions/:revisionId/upload', vereisAuthenticatie, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Geen bestand geupload' });

    try {
        const { id: projectId, modelId, revisionId } = req.params;
        const fs = require('fs');

        console.log(`[MANUAL UPLOAD] Project: ${projectId}, Model: ${modelId}, Rev: ${revisionId}`);

        // 1. Upload to Supabase Storage (using the revision's intended path)
        // We need to fetch the revision to know where it SHOULD go? 
        // Or we just overwrite the path logic here?
        // Let's rely on the revision's existing storage_path if possible, or generate a new one.

        const revision = await db.getRevisionById(revisionId);
        if (!revision) throw new Error("Revision not found");

        // Use existing storage path from revision, or fallback
        const storagePath = revision.storage_path;

        // Upload to Storage
        // Note: createFile logic inside database-helpers expects a temp path.
        // But here we want to update an EXISTING revision, not create a new file record?
        // Actually, the new flow uses 'models' and 'revisions' tables, NOT 'files' table.
        // So we should NOT call db.createFile. We should call supabase storage directly + updateRevisionStatus.

        const fileContent = fs.readFileSync(req.file.path);
        const { supabaseAdmin } = require('../services/supabase-admin'); // Import here or passed via db?
        // db acts as a wrapper. Let's look at db.createFile... it calls uploadFileToStorage.
        // We can expose a helper in db for this.

        // Let's use a specific helper "uploadManualRevision" in database-helpers.js?
        // OR just do it here if we have access. 
        // db.js exports uploadFileToStorage (wrapper).

        // We can't access uploadFileToStorage directly unless exported. 
        // It is NOT exported in database.js (wrapper) but IS in database-helpers.js (hidden).
        // Wait, database.js (wrapper) has `createFile` which does both.

        // Let's implement a new helper in database.js: `uploadRevisionFile`
        // But for now, I'll put the logic here via `db.uploadRevisionFile` (I need to add it to db.js).

        // ... Wait, I haven't added `uploadRevisionFile` to `database.js` yet.
        // Let's add the route assuming the function exists, then update database.js.

        const updatedRevision = await db.uploadRevisionFile(
            projectId,
            modelId,
            revisionId,
            req.file.path,
            req.file.originalname,
            req.file.size
        );

        // Opruimen
        fs.unlink(req.file.path, (err) => {
            if (err) console.error('Fout bij opruimen temp bestand:', err);
        });

        // --- AUTO-COMPLETE FLOW ---
        // Verify if share exists, if not generate it so QR works immediately.
        try {
            // Import services dynamically to avoid top-level circular deps if any
            const { createShareId, generateShareUrl } = require('../services/share-generator');
            const { generateQRCode } = require('../services/qr-generator');
            const { createShare, getShareByRevisionId, updateRevisionStatus } = require('../services/database-helpers');

            let share = await getShareByRevisionId(revisionId);
            if (!share) {
                console.log(`[MANUAL UPLOAD] Generating Share & QR for revision ${revisionId}...`);

                const shareId = createShareId();
                const shareUrl = generateShareUrl(shareId);
                const { qrStoragePath } = await generateQRCode(shareUrl, shareId, 'png'); // Generate QR

                await createShare({
                    revisionId,
                    shareId,
                    viewState: null,
                    qrStoragePath,
                    expiresAt: null
                });

                await updateRevisionStatus(revisionId, 'ready');
                console.log(`[MANUAL UPLOAD] Share generated: ${shareId}`);
            } else {
                // Even if share exists, ensure status is ready
                await updateRevisionStatus(revisionId, 'ready');
            }
        } catch (completeErr) {
            console.error("Error auto-completing revision:", completeErr);
            // Don't fail the request, upload was successful.
        }

        res.json(updatedRevision);

    } catch (e) {
        console.error('Manual Upload fout:', e);
        res.status(500).json({ error: e.message });
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
        res.status(500).json({ error: e.message });
    }
});

// Upload bestand naar project
router.post('/:id/upload', vereisAuthenticatie, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Geen bestand geupload' });

    try {
        const { v4: uuidv4 } = require('uuid');
        const path = require('path');

        // Check for pre-defined ID (from Revit Plugin)
        const fileId = (req.body.id && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(req.body.id))
            ? req.body.id
            : uuidv4();

        const newFile = await db.createFile(
            fileId,
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
