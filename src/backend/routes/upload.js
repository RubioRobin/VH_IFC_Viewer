/**
 * Upload Routes
 * 
 * Handles the signed upload flow:
 * 1. POST /api/upload/init - Initialize upload and get signed URL
 * 2. POST /api/upload/complete - Mark upload complete and generate QR code
 * 3. GET /api/models/:modelId/revisions/:revisionId/qrcode - Download QR code
 */

const express = require('express');
const { requireAdminApiKey } = require('../middleware/admin-api-key');
const { generateSignedUploadUrl, generateSignedDownloadUrl } = require('../services/supabase-admin');
const { createShareId, generateShareUrl } = require('../services/share-generator');
const { generateQRCode } = require('../services/qr-generator');
const {
    getOrCreateModel,
    createRevision,
    updateRevisionStatus,
    getRevisionById,
    findRevisionBySha256,
    createShare,
    getShareByRevisionId
} = require('../services/database-helpers');

const router = express.Router();

/**
 * POST /api/upload/init
 * 
 * Initialize upload and get signed upload URL
 */
router.post('/init', requireAdminApiKey, async (req, res) => {
    try {
        const {
            projectId,
            modelName,
            fileName,
            fileSize,
            sha256,
            viewState,
            meta
        } = req.body;

        // Validate required fields
        if (!projectId || !fileName) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['projectId', 'fileName']
            });
        }

        // Validate file extension
        if (!fileName.toLowerCase().endsWith('.ifc')) {
            return res.status(400).json({
                error: 'Invalid file type',
                message: 'Only .ifc files are supported'
            });
        }

        console.log(`[UPLOAD INIT] Project: ${projectId}, File: ${fileName}`);

        // Check for duplicate by SHA256 (optional optimization)
        if (sha256 && modelName) {
            const model = await getOrCreateModel(projectId, modelName || fileName);
            const existingRevision = await findRevisionBySha256(model.id, sha256);

            if (existingRevision) {
                console.log(`[UPLOAD INIT] Duplicate detected (SHA256), returning existing revision`);

                // Get existing share
                const existingShare = await getShareByRevisionId(existingRevision.id);

                return res.json({
                    duplicate: true,
                    modelId: model.id,
                    revisionId: existingRevision.id,
                    shareUrl: existingShare ? generateShareUrl(existingShare.share_id) : null,
                    message: 'This file has already been uploaded'
                });
            }
        }

        // Get or create model
        const model = await getOrCreateModel(projectId, modelName || fileName);

        // Generate storage path
        const revisionId = require('uuid').v4();
        const storagePath = `projects/${projectId}/models/${model.id}/revisions/${revisionId}/${fileName}`;

        // Create revision record
        const revision = await createRevision({
            modelId: model.id,
            storagePath,
            fileName,
            fileSize,
            sha256,
            revitDocGuid: meta?.revitDocGuid,
            revitViewId: meta?.viewId,
            elementIds: meta?.elementIds
        });

        // Generate signed upload URL (15 min expiry)
        const uploadData = await generateSignedUploadUrl('ifc-private', storagePath, 900);

        console.log(`[UPLOAD INIT] Success - Model: ${model.id}, Revision: ${revision.id}`);

        res.json({
            modelId: model.id,
            revisionId: revision.id,
            objectKey: storagePath,
            signedUploadUrl: uploadData.signedUrl,
            expiresAt: uploadData.expiresAt
        });

    } catch (error) {
        console.error('[UPLOAD INIT] Error:', error);
        res.status(500).json({
            error: 'Failed to initialize upload',
            message: error.message
        });
    }
});

/**
 * POST /api/upload/complete
 * 
 * Mark upload as complete and generate QR code
 */
router.post('/complete', requireAdminApiKey, async (req, res) => {
    try {
        const { modelId, revisionId, uploadTag } = req.body;

        if (!modelId || !revisionId) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['modelId', 'revisionId']
            });
        }

        console.log(`[UPLOAD COMPLETE] Model: ${modelId}, Revision: ${revisionId}`);

        // Get revision
        const revision = await getRevisionById(revisionId);
        if (!revision) {
            return res.status(404).json({ error: 'Revision not found' });
        }

        // Check if already completed
        if (revision.status === 'ready') {
            console.log(`[UPLOAD COMPLETE] Already completed, returning existing data`);
            const existingShare = await getShareByRevisionId(revisionId);

            return res.json({
                status: 'ready',
                shareUrl: existingShare ? generateShareUrl(existingShare.share_id) : null,
                qrDownloadUrl: existingShare ? `/api/models/${modelId}/revisions/${revisionId}/qrcode?format=png` : null
            });
        }

        // Update status to uploaded
        await updateRevisionStatus(revisionId, 'uploaded');

        // Generate share ID and URL
        const shareId = createShareId();
        const shareUrl = generateShareUrl(shareId);

        console.log(`[UPLOAD COMPLETE] Generated share: ${shareId}`);

        // Generate QR code
        const { qrPublicUrl, qrStoragePath } = await generateQRCode(shareUrl, shareId, 'png');

        // Create share record
        await createShare({
            revisionId,
            shareId,
            viewState: req.body.viewState || null,
            qrStoragePath,
            expiresAt: null // No expiration by default
        });

        // Update revision status to ready
        await updateRevisionStatus(revisionId, 'ready');

        console.log(`[UPLOAD COMPLETE] Success - Share: ${shareId}`);

        res.json({
            status: 'ready',
            shareUrl,
            qrDownloadUrl: `/api/models/${modelId}/revisions/${revisionId}/qrcode?format=png`,
            qrPublicUrl // Direct public URL (for reference)
        });

    } catch (error) {
        console.error('[UPLOAD COMPLETE] Error:', error);

        // Try to mark revision as failed
        if (req.body.revisionId) {
            try {
                await updateRevisionStatus(req.body.revisionId, 'failed');
            } catch (e) {
                console.error('[UPLOAD COMPLETE] Failed to mark revision as failed:', e);
            }
        }

        res.status(500).json({
            error: 'Failed to complete upload',
            message: error.message
        });
    }
});

/**
 * GET /api/models/:modelId/revisions/:revisionId/qrcode
 * 
 * Download QR code image
 */
router.get('/models/:modelId/revisions/:revisionId/qrcode', requireAdminApiKey, async (req, res) => {
    try {
        const { modelId, revisionId } = req.params;
        const format = req.query.format || 'png';

        // Get share for this revision
        const share = await getShareByRevisionId(revisionId);
        if (!share || !share.qr_storage_path) {
            return res.status(404).json({ error: 'QR code not found' });
        }

        // Generate signed download URL for QR image
        const signedUrl = await generateSignedDownloadUrl('qr-public', share.qr_storage_path, 300);

        // Redirect to signed URL
        res.redirect(signedUrl);

    } catch (error) {
        console.error('[QR DOWNLOAD] Error:', error);
        res.status(500).json({
            error: 'Failed to download QR code',
            message: error.message
        });
    }
});

module.exports = router;
