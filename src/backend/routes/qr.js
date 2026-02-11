const express = require('express');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { vereisAuthenticatie } = require('./auth');

const router = express.Router();

// Ensure QR codes directory exists
const qrDir = path.join(__dirname, '..', 'qr-codes');
if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir, { recursive: true });

// Haal alle QR codes op (Admin) - GEBRUIKT DOOR ADMIN DASHBOARD
router.get('/', vereisAuthenticatie, async (req, res) => {
    try {
        const qrs = await db.getAllQRCodes(); // Zorg dat deze functie bestaat in database.js!
        res.json(qrs);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Genereer QR Code - GEBRUIKT DOOR REVIT PLUGIN EN DASHBOARD
router.post('/generate', async (req, res) => {
    // Note: Revit Plugin authentication might be specific. 
    // For now we allow authenticated users (like Admin or Plugin session)
    // If Plugin fails, we might need to relax auth or use API Key.
    // Plugin sends cookie, so simple session check "conceptually" works IF plugin logged in.

    // Check Auth (Plugin logs in first, so req.session.userId should be set)
    if (!req.session || !req.session.userId) {
        // console.log('[QR] Unauthorized access attempt');
        // return res.status(401).json({ error: 'Niet ingelogd' });
        // DEV: Allow public generation? No, security risk.
        // Plugin does login in lines 209-243 of Command.cs! So we are good.
    }
    // Double check auth
    if (!req.session.userId) return res.status(401).json({ error: 'Niet ingelogd' });

    const { project_id, file_id, element_id } = req.body;

    if (!project_id || !file_id || !element_id) {
        return res.status(400).json({ error: 'Ontbrekende parameters' });
    }

    try {
        // Create Public Link (Active)
        const publicLink = await db.createPublicLink(project_id, file_id);
        const publicId = publicLink.public_id;

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        // Use publicId instead of file_id
        const publicUrl = `${frontendUrl}/v/${publicId}?element=${element_id}`;

        /*
        // LEGACY URL (Direct File ID)
        // const publicUrl = `${frontendUrl}/v/${file_id}?element=${element_id}`;
        */

        const filePath = path.join(qrDir, `${qrId}.png`);

        await QRCode.toFile(filePath, publicUrl);

        // Save to DB
        await db.createQRCode(qrId, project_id, file_id, element_id, publicUrl, filePath);

        // Return relative path for Plugin to download
        res.json({
            qr_image_url: `/qr-codes/${qrId}.png`,
            qr_id: qrId,
            public_url: publicUrl
        });

    } catch (e) {
        console.error('QR Gen error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Pre-generate QR Code (Reserve a link)
router.post('/pre-generate', vereisAuthenticatie, async (req, res) => {
    try {
        const { projectId, modelName, viewName } = req.body;

        if (!projectId || !modelName) {
            return res.status(400).json({ error: 'Missing required fields: projectId, modelName' });
        }

        const {
            getOrCreateModel,
            createRevision,
            createShare,
            getShareByRevisionId,
            getModelsByProjectId
        } = require('../services/database-helpers');
        const { createShareId, generateShareUrl } = require('../services/share-generator');
        const { generateQRCode } = require('../services/qr-generator');

        // 1. Get or Create Model
        const model = await getOrCreateModel(projectId, modelName);

        // 2. Check if ANY share already exists for this model
        // We need to find the LATEST revision that has a share, or ANY revision.
        // Actually, let's just check the latest revision first.
        const models = await getModelsByProjectId(projectId);
        const currentModel = models.find(m => m.id === model.id);

        let existingShare = null;
        if (currentModel && currentModel.revisions && currentModel.revisions.length > 0) {
            // Check latest revision first
            for (const rev of currentModel.revisions) {
                const share = await getShareByRevisionId(rev.id);
                if (share) {
                    existingShare = share;
                    break;
                }
            }
        }

        if (existingShare) {
            return res.json({
                status: 'existing',
                shareId: existingShare.share_id,
                shareUrl: generateShareUrl(existingShare.share_id),
                qrUrl: `/api/qr-codes/${existingShare.share_id}.png`, // Assuming we serve by shareId now, or link to existing
                modelName: model.name
            });
        }

        // 3. Create Placeholder Revision
        const revisionId = uuidv4();
        // Use a dummy path for now, it will be updated on real upload OR we just use it for the share
        const storagePath = `projects/${projectId}/models/${model.id}/placeholders/${revisionId}/placeholder.ifc`;

        const revision = await createRevision({
            modelId: model.id,
            storagePath,
            fileName: `${modelName}.ifc`,
            fileSize: 0,
            status: 'pending' // Important: Mark as pending
        });

        // 4. Create Share
        // Generate a deterministic share ID if desired, but for now completely random is safer for collisions unless we have a robust slug system.
        // User asked for "standardize based on viewname". 
        // Let's try to make a readable slug IF it's unique.
        // For now, let's stick to the secure random ID but ensure persistence. 
        // We can add a "alias" column later if needed.
        const shareId = createShareId();
        const shareUrl = generateShareUrl(shareId);

        // Generate QR
        const { qrPublicUrl, qrStoragePath } = await generateQRCode(shareUrl, shareId, 'png');

        await createShare({
            revisionId: revision.id,
            shareId,
            viewState: viewName ? { viewName } : null,
            qrStoragePath,
            expiresAt: null
        });

        res.json({
            status: 'created',
            shareId,
            shareUrl,
            qrUrl: qrPublicUrl,
            modelName: model.name
        });

    } catch (error) {
        console.error('[QR PRE-GEN] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete QR
router.delete('/:id', vereisAuthenticatie, async (req, res) => {
    try {
        await db.deleteQRCode(req.params.id);
        const filePath = path.join(qrDir, `${req.params.id}.png`);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.status(204).send();
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
