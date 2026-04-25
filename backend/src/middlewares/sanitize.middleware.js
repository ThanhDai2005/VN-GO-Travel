/**
 * Sanitize Middleware
 * Prevents NoSQL injection attacks by sanitizing user input
 *
 * CUSTOM IMPLEMENTATION: express-mongo-sanitize v2.2.0 is incompatible with Express 5.x
 * Root cause: Express 5.x made req.query a getter-only property, but the library tries to reassign it
 *
 * This custom sanitizer provides the same security without the crash
 */

/**
 * Recursively remove keys starting with $ or containing .
 */
function sanitizeObject(obj, path = '') {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map((item, index) => sanitizeObject(item, `${path}[${index}]`));
    }

    const sanitized = {};
    let hasSanitized = false;

    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            const fullPath = path ? `${path}.${key}` : key;

            // Check for prohibited characters
            if (key.startsWith('$') || key.includes('.')) {
                console.warn(`[SECURITY] Sanitized potentially malicious input: ${fullPath} (key: "${key}")`);
                hasSanitized = true;
                // Replace with safe key
                const safeKey = key.replace(/^\$+/, '_').replace(/\./g, '_');
                sanitized[safeKey] = sanitizeObject(obj[key], fullPath);
            } else {
                sanitized[key] = sanitizeObject(obj[key], fullPath);
            }
        }
    }

    return sanitized;
}

/**
 * Middleware to sanitize req.body, req.params, req.query
 * Compatible with Express 5.x (does not reassign getter-only properties)
 */
const sanitizeInput = (req, res, next) => {
    try {
        // Sanitize body (mutable)
        if (req.body && typeof req.body === 'object') {
            req.body = sanitizeObject(req.body, 'body');
        }

        // Sanitize params (mutable)
        if (req.params && typeof req.params === 'object') {
            req.params = sanitizeObject(req.params, 'params');
        }

        // Sanitize query (Express 5.x: getter-only, so we sanitize in-place)
        if (req.query && typeof req.query === 'object') {
            const sanitizedQuery = sanitizeObject(req.query, 'query');

            // For Express 5.x compatibility: delete original keys and add sanitized ones
            for (const key in req.query) {
                if (req.query.hasOwnProperty(key)) {
                    delete req.query[key];
                }
            }

            for (const key in sanitizedQuery) {
                if (sanitizedQuery.hasOwnProperty(key)) {
                    req.query[key] = sanitizedQuery[key];
                }
            }
        }

        next();
    } catch (error) {
        console.error('[SECURITY] Sanitization error:', error);
        // Don't block request on sanitization error, but log it
        next();
    }
};

module.exports = { sanitizeInput };
