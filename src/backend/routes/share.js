const express = require('express');
const db = require('../database');
const router = express.Router();

// Public Share Endpoint
router.get('/:token', async (req, res) => {
    const { token } = req.params;

    try {
        const share = await db.getShareByToken(token);
        if (!share) {
            return res.status(404).json({ error: 'Share not found or expired' });
        }

        const version = share.model_versions;
        const model = version.models;
        const project = model.projects;

        // Generate signed read URL for IFC (Assumes 'ifc-private' bucket)
        // Adjust bucket name if necessary based on existing storage setup
        const ifcSignedUrl = await db.getFileDownloadUrl(version.storage_path_ifc);

        if (!ifcSignedUrl) {
            return res.status(500).json({ error: 'Failed to generate download link' });
        }

        res.json({
            modelName: model.name,
            projectName: project.name,
            ifcSignedUrl: ifcSignedUrl,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 mins matching DB helper
        });

        // Optional: Update last_accessed_at in the background
        db.supabase.from('shares').update({ last_accessed_at: new Date().toISOString() }).eq('id', share.id).then();

    } catch (e) {
        console.error('Share access error:', e);
        res.status(500).json({ error: 'An error occurred while fetching the share' });
    }
});

module.exports = router;
