const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../database');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const PLUGIN_CLIENT_ID = process.env.PLUGIN_CLIENT_ID || 'revit_plugin';
const PLUGIN_CLIENT_SECRET = process.env.PLUGIN_CLIENT_SECRET;

if (!JWT_SECRET) {
    console.error('❌ KRITIEK: JWT_SECRET is niet ingesteld! Plugin-authenticatie is onmogelijk. Applicatie stopt.');
    process.exit(1);
}
if (!PLUGIN_CLIENT_SECRET) {
    console.error('❌ KRITIEK: PLUGIN_CLIENT_SECRET is niet ingesteld! Plugin-authenticatie is onmogelijk. Applicatie stopt.');
    process.exit(1);
}

// Middleware om Plugin JWT te verifiëren
const authenticatePlugin = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Niet geautoriseerd: Token ontbreekt' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.plugin = decoded; // Bevat client_id
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Niet geautoriseerd: Ongeldig token' });
    }
};

// Middleware om ingeplugde gebruikers-JWT te verifiëren
const authenticatePluginUser = (req, res, next) => {
    const userToken = req.headers['x-user-token'];
    // Optioneel: als het token aanwezig is, decoderen we het.
    // Indien verplicht, controleer per route.
    if (userToken) {
        try {
            const decoded = jwt.verify(userToken, JWT_SECRET);
            req.user = decoded;
        } catch (e) {
            console.warn('Ongeldig gebruikerstoken:', e.message);
        }
    }
    next();
};

// 1. Plugin Login (Serviceaccount)
router.post('/login', (req, res) => {
    const { client_id, client_secret } = req.body;

    if (client_id === PLUGIN_CLIENT_ID && client_secret === PLUGIN_CLIENT_SECRET) {
        const token = jwt.sign({ client_id }, JWT_SECRET, { expiresIn: '1h' });
        return res.json({ access_token: token, expires_in: 3600 });
    }

    res.status(401).json({ error: 'Ongeldige inloggegevens' });
});

// 1.1 Gebruikerslogin (via Plugin)
router.post('/user-login', authenticatePlugin, async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await db.getUserByUsername(username);
        if (user && !user.disabled && await bcrypt.compare(password, user.password_hash)) {
            // Geef een langdurig token uit voor de plugin-gebruiker
            const token = jwt.sign(
                { userId: user.id, username: user.username },
                JWT_SECRET,
                { expiresIn: '7d' } // 7 dagen persistentie
            );
            return res.json({
                access_token: token,
                username: user.username,
                expires_in: 7 * 24 * 3600
            });
        }
        if (user && user.disabled) {
            return res.status(403).json({ error: 'Account is uitgeschakeld. Neem contact op met een beheerder.' });
        }
        res.status(401).json({ error: 'Ongeldige gebruikersnaam of wachtwoord.' });
    } catch (e) {
        console.error('[Plugin] User-login fout:', e);
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

// 2. Projecten ophalen
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
        console.error('[Plugin] Projecten ophalen fout:', e);
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

// 3. Model aanmaken
router.post('/models/create', authenticatePlugin, authenticatePluginUser, async (req, res) => {
    const { projectId, modelName, uploaderName } = req.body;
    try {
        const createdBy = req.user ? req.user.username : (uploaderName || 'Plugin');
        const model = await db.createModel(projectId, modelName, createdBy);
        res.json({ modelId: model.id });
    } catch (e) {
        console.error('[Plugin] Model aanmaken fout:', e);
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

// 4. Upload-sessie aanmaken
router.post('/models/:modelId/versions/upload-session', authenticatePlugin, authenticatePluginUser, async (req, res) => {
    const { modelId } = req.params;
    const { fileName, contentType, fileSize, checksumSha256 } = req.body;

    // Bestandsnaam sanitiseren om 'InvalidKey'-fouten in Supabase Storage te voorkomen
    const sanitizedFileName = (fileName || 'unnamed.ifc').replace(/[^a-zA-Z0-9.\-_]/g, '_');

    try {
        const storagePath = `revit_exports/${modelId}/${uuidv4()}_${sanitizedFileName}`;
        const uploadInfo = await db.createSignedUploadUrl(storagePath);

        if (!uploadInfo) throw new Error('Kon upload URL niet genereren');

        // Create a pending version record
        const version = await db.createModelVersion(modelId, storagePath, fileSize, checksumSha256);

        // SYNC: Also register in the 'files' table so it shows up in the project dashboard
        try {
            const { data: model } = await db.supabase.from('models').select('project_id').eq('id', modelId).single();
            if (model) {
                const userName = req.user ? req.user.username : (req.body.uploaderName || 'Revit User');
                await db.createFile(null, model.project_id, fileName, storagePath, fileSize, userName);
            }
        } catch (syncError) {
            console.warn('Dashboard sync failed (non-critical):', syncError.message);
        }

        res.json({
            versionId: version.id,
            uploadUrl: uploadInfo.signedUrl,
            storagePath: storagePath
        });
    } catch (e) {
        console.error('[Plugin] Upload-sessie fout:', e);
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

// 5. Versie afronden
router.post('/models/:modelId/versions/:versionId/complete', authenticatePlugin, async (req, res) => {
    // In deze implementatie handelt createModelVersion de metadata al af.
    // Dit endpoint kan worden gebruikt voor naverwerking of simpelweg OK teruggeven.
    res.json({ ok: true });
});

// 6. Deellink aanmaken
router.post('/models/:modelId/versions/:versionId/share', authenticatePlugin, async (req, res) => {
    const { versionId } = req.params;
    const shareToken = uuidv4();
    try {
        const share = await db.createShare(versionId, shareToken);
        const baseUrl = process.env.VIEWER_URL || 'http://localhost:5173';
        const viewerUrl = `${baseUrl}/v/${shareToken}`;
        res.json({ token: shareToken, viewerUrl });
    } catch (e) {
        console.error('[Plugin] Deellink aanmaken fout:', e);
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

// 7. QR-code genereren
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
        console.error('[Plugin] QR genereren mislukt:', e);
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

// 8. Bestanden ophalen per project (voor assembly code matching)
router.get('/projects/:projectId/files', authenticatePlugin, async (req, res) => {
    const { projectId } = req.params;
    try {
        const files = await db.getFilesByProjectId(projectId);
        const simplified = files.map(f => ({
            id: f.id,
            filename: f.filename || f.original_name,
            path: f.path,
            size: f.size,
            created_at: f.created_at || f.upload_date
        }));
        res.json(simplified);
    } catch (e) {
        console.error('[Plugin] Projecten ophalen fout:', e);
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

// 9. Share + QR genereren voor een bestaand bestand (assembly code link workflow)
router.post('/files/:fileId/share-qr', authenticatePlugin, async (req, res) => {
    const { fileId } = req.params;
    const { projectId } = req.body;

    try {
        // 1. Haal bestand op
        const file = await db.getFileById(fileId);
        if (!file) return res.status(404).json({ error: 'Bestand niet gevonden' });

        // 2. Maak model + versie aan (hergebruik bestaand bestand in storage)
        const modelName = file.filename || file.original_name || 'Unnamed';
        const model = await db.createModel(projectId, modelName, 'Plugin-Link');
        const version = await db.createModelVersion(model.id, file.path, file.size, null);

        // 3. Share link genereren
        const shareToken = uuidv4();
        await db.createShare(version.id, shareToken);
        const baseUrl = process.env.VIEWER_URL || 'http://localhost:5173';
        const viewerUrl = `${baseUrl}/v/${shareToken}`;

        // 4. QR code genereren als buffer
        const qrBuffer = await QRCode.toBuffer(viewerUrl, {
            errorCorrectionLevel: 'H',
            type: 'png',
            margin: 1,
            width: 1024
        });

        // 5. QR opslaan in Supabase Storage
        const qrStoragePath = `qr_codes/${model.id}/${version.id}_qr.png`;
        const { error: uploadError } = await db.supabase.storage
            .from('qr-public')
            .upload(qrStoragePath, qrBuffer, {
                contentType: 'image/png',
                upsert: true
            });

        if (uploadError) throw uploadError;
        await db.createQRAsset(projectId, version.id, qrStoragePath);

        // 6. QR public URL ophalen
        const { data: urlData } = db.supabase.storage
            .from('qr-public')
            .getPublicUrl(qrStoragePath);

        res.json({
            viewerUrl,
            shareToken,
            qrUrl: urlData.publicUrl,
            modelId: model.id,
            versionId: version.id
        });
    } catch (e) {
        console.error('[Plugin] Share-QR genereren mislukt:', e);
        res.status(500).json({ error: 'Er is een onverwachte fout opgetreden.' });
    }
});

module.exports = router;
