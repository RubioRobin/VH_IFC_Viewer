/**
 * Supabase Admin Client
 * 
 * This module creates a Supabase client using the SERVICE ROLE KEY
 * for admin operations like generating signed URLs and bypassing RLS.
 * 
 * SECURITY WARNING: This key must NEVER be exposed to the frontend or Revit add-in.
 */

// Load environment variables first
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ CRITICAL: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set!');
    console.error('   Service role key is required for signed URL generation.');
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Missing required Supabase credentials');
    }
}

// Create admin client with service role key
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

console.log('✅ Supabase Admin client initialized (service role)');

/**
 * Generate a signed upload URL for Supabase Storage
 * @param {string} bucket - Bucket name (e.g., 'ifc-private')
 * @param {string} path - Object path within bucket
 * @param {number} expiresIn - Expiry time in seconds (default: 900 = 15 min)
 * @returns {Promise<{signedUrl: string, path: string, token: string}>}
 */
async function generateSignedUploadUrl(bucket, path, expiresIn = 900) {
    try {
        const { data, error } = await supabaseAdmin.storage
            .from(bucket)
            .createSignedUploadUrl(path, {
                upsert: true // Allow overwriting existing files
            });

        if (error) {
            console.error('Error generating signed upload URL:', error);
            throw error;
        }

        return {
            signedUrl: data.signedUrl,
            path: data.path,
            token: data.token,
            expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
        };
    } catch (error) {
        console.error('generateSignedUploadUrl error:', error);
        throw error;
    }
}

/**
 * Generate a signed download URL for Supabase Storage
 * @param {string} bucket - Bucket name (e.g., 'ifc-private')
 * @param {string} path - Object path within bucket
 * @param {number} expiresIn - Expiry time in seconds (default: 900 = 15 min)
 * @returns {Promise<string>} Signed download URL
 */
async function generateSignedDownloadUrl(bucket, path, expiresIn = 900) {
    try {
        const { data, error } = await supabaseAdmin.storage
            .from(bucket)
            .createSignedUrl(path, expiresIn);

        if (error) {
            console.error('Error generating signed download URL:', error);
            throw error;
        }

        return data.signedUrl;
    } catch (error) {
        console.error('generateSignedDownloadUrl error:', error);
        throw error;
    }
}

/**
 * Upload a file to Supabase Storage (server-side)
 * @param {string} bucket - Bucket name
 * @param {string} path - Object path within bucket
 * @param {Buffer} fileBuffer - File data as Buffer
 * @param {string} contentType - MIME type
 * @returns {Promise<{path: string}>}
 */
async function uploadFile(bucket, path, fileBuffer, contentType = 'application/octet-stream') {
    try {
        const { data, error } = await supabaseAdmin.storage
            .from(bucket)
            .upload(path, fileBuffer, {
                contentType,
                upsert: true
            });

        if (error) {
            console.error('Error uploading file:', error);
            throw error;
        }

        return data;
    } catch (error) {
        console.error('uploadFile error:', error);
        throw error;
    }
}

/**
 * Get public URL for a file in a public bucket
 * @param {string} bucket - Bucket name
 * @param {string} path - Object path within bucket
 * @returns {string} Public URL
 */
function getPublicUrl(bucket, path) {
    const { data } = supabaseAdmin.storage
        .from(bucket)
        .getPublicUrl(path);

    return data.publicUrl;
}

module.exports = {
    supabaseAdmin,
    generateSignedUploadUrl,
    generateSignedDownloadUrl,
    uploadFile,
    getPublicUrl
};
