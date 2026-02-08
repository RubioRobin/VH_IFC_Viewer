/**
 * Viewer Routes
 * 
 * Public routes for the IFC viewer.
 * No authentication required - uses shareId for access control.
 */

const express = require('express');
const { getShareByShareId } = require('../services/database-helpers');
const { generateSignedDownloadUrl } = require('../services/supabase-admin');

const router = express.Router();

/**
 * GET /api/viewer/share/:shareId
 * 
 * Public endpoint to get IFC file and metadata for viewer
 * No authentication required
 */
router.get('/share/:shareId', async (req, res) => {
    try {
        const { shareId } = req.params;

        if (!shareId) {
            return res.status(400).json({ error: 'Missing shareId' });
        }

        console.log(`[VIEWER] Share request: ${shareId}`);

        // Get share with nested revision, model, and project data
        const share = await getShareByShareId(shareId);

        if (!share) {
            return res.status(404).json({
                error: 'Share not found',
                message: 'This link is invalid or has been removed'
            });
        }

        // Check if expired
        if (share.expires_at && new Date(share.expires_at) < new Date()) {
            return res.status(410).json({
                error: 'Share expired',
                message: 'This link has expired'
            });
        }

        const revision = share.revision;
        const model = revision.model;
        const project = model.project;

        // Check if revision is ready
        if (revision.status !== 'ready') {
            return res.status(503).json({
                error: 'Model not ready',
                message: `Model is currently ${revision.status}. Please try again later.`,
                status: revision.status
            });
        }

        // Generate signed download URL for IFC file (15 min expiry)
        const ifcDownloadUrl = await generateSignedDownloadUrl(
            'ifc-private',
            revision.storage_path,
            900 // 15 minutes
        );

        console.log(`[VIEWER] Success - Share: ${shareId}, Revision: ${revision.id}`);

        // Return viewer data
        res.json({
            project: {
                id: project.id,
                name: project.name,
                description: project.description
            },
            model: {
                id: model.id,
                name: model.name,
                description: model.description
            },
            revision: {
                revisionId: revision.id,
                revisionNumber: revision.revision_number,
                fileName: revision.file_name,
                fileSize: revision.file_size,
                ifcDownloadUrl,
                viewState: share.view_state,
                createdAt: revision.created_at
            }
        });

    } catch (error) {
        console.error('[VIEWER] Error:', error);
        res.status(500).json({
            error: 'Failed to load share',
            message: error.message
        });
    }
});

module.exports = router;
