const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../database');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'revit-plugin-secret-key';
const PLUGIN_CLIENT_ID = process.env.PLUGIN_CLIENT_ID || 'revit_plugin';
const PLUGIN_CLIENT_SECRET = process.env.PLUGIN_CLIENT_SECRET || 'revit_secret_123';

// Middleware to verify Plugin JWT
const authenticatePlugin = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.plugin = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};

// 1. Plugin Login
router.post('/login', (req, res) => {
    const { client_id, client_secret } = req.body;

    if (client_id === PLUGIN_CLIENT_ID && client_secret === PLUGIN_CLIENT_SECRET) {
        const token = jwt.sign({ client_id }, JWT_SECRET, { expiresIn: '1h' });
        return res.json({ access_token: token, expires_in: 3600 });
    }

    res.status(401).json({ error: 'Invalid credentials' });
});

// 2. Get Projects
router.get('/projects', authenticatePlugin, async (req, res) => {
    try {
        const projects = await db.getAllProjects();
        const simplified = projects.map(p => ({
            id: p.id,
            name: p.name,
            code: p.code || p.name.substring(0, 3).toUpperCase()
        }));
        res.json(simplified);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3. Create Model
router.post('/models/create', authenticatePlugin, async (req, res) => {
    const { projectId, modelName } = req.body;
    try {
        const model = await db.createModel(projectId, modelName);
        res.json({ modelId: model.id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 4. Create Upload Session
router.post('/models/:modelId/versions/upload-session', authenticatePlugin, async (req, res) => {
    const { modelId } = req.params;
    const { fileName, contentType, fileSize, checksumSha256 } = req.body;

    try {
        const storagePath = `revit_exports/${modelId}/${uuidv4()}_${fileName}`;
        const uploadInfo = await db.createSignedUploadUrl(storagePath);

        if (!uploadInfo) throw new Error('Failed to generate upload URL');

        // Create a pending version record
        const version = await db.createModelVersion(modelId, storagePath, fileSize, checksumSha256);

        res.json({
            versionId: version.id,
            uploadUrl: uploadInfo.signedUrl,
            storagePath: storagePath
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 5. Complete Version
router.post('/models/:modelId/versions/:versionId/complete', authenticatePlugin, async (req, res) => {
    // In this implementation, createModelVersion already handles metadata.
    // This endpoint can be used to trigger post-processing or just return OK.
    res.json({ ok: true });
});

// 6. Create Share
router.post('/models/:modelId/versions/:versionId/share', authenticatePlugin, async (req, res) => {
    const { versionId } = req.params;
    const shareToken = uuidv4();
    try {
        const share = await db.createShare(versionId, shareToken);
        const baseUrl = process.env.VIEWER_URL || 'http://localhost:5173';
        const viewerUrl = `${baseUrl}/v/${shareToken}`;
        res.json({ token: shareToken, viewerUrl });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 7. Generate QR
router.post('/models/:modelId/versions/:versionId/qr', authenticatePlugin, async (req, res) => {
    const { modelId, versionId } = req.params;
    const { viewerUrl, projectId } = req.body;

    try {
        // Generate QR code as Buffer
        const qrBuffer = await QRCode.toBuffer(viewerUrl, {
            errorCorrectionLevel: 'H',
            type: 'png',
            margin: 1,
            width: 1024
        });

        const storagePath = `qr_codes/${modelId}/${versionId}_qr.png`;

        // Upload to Supabase Storage (Assumes 'qr-public' bucket exists)
        const { data, error } = await db.supabase.storage
            .from('qr-public')
            .upload(storagePath, qrBuffer, {
                contentType: 'image/png',
                upsert: true
            });

        if (error) throw error;

        await db.createQRAsset(projectId, versionId, storagePath);

        // Get public URL (if bucket is public) or signed URL
        const { data: urlData } = db.supabase.storage
            .from('qr-public')
            .getPublicUrl(storagePath);

        res.json({ qrUrl: urlData.publicUrl });
    } catch (e) {
        console.error('QR Generation Failed:', e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
