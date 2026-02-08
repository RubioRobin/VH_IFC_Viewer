/**
 * Admin API Key Middleware
 * 
 * Validates the admin API key from the Authorization header.
 * This is a simple authentication mechanism for the Revit add-in.
 * 
 * Future enhancement: Replace with device pairing flow for multi-user scenarios.
 */

/**
 * Middleware to require admin API key
 * @param {Request} req 
 * @param {Response} res 
 * @param {Function} next 
 */
function requireAdminApiKey(req, res, next) {
    const authHeader = req.headers.authorization;

    // Check if Authorization header exists
    if (!authHeader) {
        return res.status(401).json({
            error: 'Missing Authorization header',
            message: 'Please provide an API key in the Authorization header (Bearer <key>)'
        });
    }

    // Check if it's a Bearer token
    if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            error: 'Invalid Authorization header format',
            message: 'Authorization header must be in format: Bearer <api-key>'
        });
    }

    // Extract token
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Validate against environment variable
    const adminApiKey = process.env.ADMIN_API_KEY;

    if (!adminApiKey) {
        console.error('❌ ADMIN_API_KEY not set in environment variables!');
        return res.status(500).json({
            error: 'Server configuration error',
            message: 'Admin API key not configured on server'
        });
    }

    if (token !== adminApiKey) {
        console.warn('⚠️  Invalid API key attempt from IP:', req.ip);
        return res.status(403).json({
            error: 'Invalid API key',
            message: 'The provided API key is not valid'
        });
    }

    // API key is valid, proceed
    next();
}

module.exports = {
    requireAdminApiKey
};
