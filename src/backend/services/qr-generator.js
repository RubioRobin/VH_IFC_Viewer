/**
 * QR Code Generator Service
 * 
 * Generates QR codes (PNG/SVG) and uploads them to Supabase Storage.
 */

const QRCode = require('qrcode');
const { uploadFile, getPublicUrl } = require('./supabase-admin');

/**
 * Generate a QR code and upload to Supabase Storage
 * @param {string} shareUrl - The URL to encode in the QR code
 * @param {string} shareId - The share ID (used for filename)
 * @param {string} format - 'png' or 'svg' (default: 'png')
 * @returns {Promise<{qrPublicUrl: string, qrStoragePath: string}>}
 */
async function generateQRCode(shareUrl, shareId, format = 'png') {
    try {
        const storagePath = `shares/${shareId}.${format}`;
        let qrBuffer;
        let contentType;

        if (format === 'svg') {
            // Generate SVG
            const svgString = await QRCode.toString(shareUrl, {
                type: 'svg',
                errorCorrectionLevel: 'M',
                margin: 2,
                width: 512
            });
            qrBuffer = Buffer.from(svgString, 'utf-8');
            contentType = 'image/svg+xml';
        } else {
            // Generate PNG (default)
            qrBuffer = await QRCode.toBuffer(shareUrl, {
                errorCorrectionLevel: 'M',
                margin: 2,
                width: 512,
                type: 'png'
            });
            contentType = 'image/png';
        }

        // Upload to qr-public bucket
        await uploadFile('qr-public', storagePath, qrBuffer, contentType);

        // Get public URL
        const qrPublicUrl = getPublicUrl('qr-public', storagePath);

        console.log(`✅ QR code generated: ${storagePath}`);

        return {
            qrPublicUrl,
            qrStoragePath: storagePath
        };
    } catch (error) {
        console.error('Error generating QR code:', error);
        throw error;
    }
}

/**
 * Generate QR code as base64 (for direct embedding)
 * @param {string} shareUrl - The URL to encode
 * @param {string} format - 'png' or 'svg'
 * @returns {Promise<string>} Base64-encoded QR code
 */
async function generateQRCodeBase64(shareUrl, format = 'png') {
    try {
        if (format === 'svg') {
            const svgString = await QRCode.toString(shareUrl, {
                type: 'svg',
                errorCorrectionLevel: 'M',
                margin: 2,
                width: 512
            });
            return `data:image/svg+xml;base64,${Buffer.from(svgString).toString('base64')}`;
        } else {
            // PNG
            const dataUrl = await QRCode.toDataURL(shareUrl, {
                errorCorrectionLevel: 'M',
                margin: 2,
                width: 512,
                type: 'image/png'
            });
            return dataUrl;
        }
    } catch (error) {
        console.error('Error generating QR code base64:', error);
        throw error;
    }
}

module.exports = {
    generateQRCode,
    generateQRCodeBase64
};
