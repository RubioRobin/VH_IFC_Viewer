/**
 * Share Generator Service
 * 
 * Generates unique shareId tokens and viewer URLs for public IFC sharing.
 */

const { customAlphabet } = require('nanoid');

// Create a custom alphabet for URL-safe share IDs
// Using alphanumeric characters (no special chars for simplicity)
const generateShareId = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 12);

/**
 * Generate a unique share ID
 * @returns {string} Random 12-character alphanumeric string
 */
function createShareId() {
    return generateShareId();
}

/**
 * Generate a viewer URL for a share ID
 * @param {string} shareId - The share ID
 * @returns {string} Full viewer URL
 */
function generateShareUrl(shareId) {
    const viewerUrl = process.env.VIEWER_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
    return `${viewerUrl}/v/${shareId}`;
}

module.exports = {
    createShareId,
    generateShareUrl
};
