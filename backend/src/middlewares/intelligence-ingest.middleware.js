const jwt = require('jsonwebtoken');
const { AppError } = require('./error.middleware');
const User = require('../models/user.model');
const config = require('../config');

/**
 * RBEL / 7.3 ingestion: Bearer JWT **or** `X-Api-Key` when `INTELLIGENCE_INGEST_API_KEY` is configured.
 * Sets `req.user` (User doc) or `req.intelligenceIngestKey` (boolean).
 */
const intelligenceIngestAuth = async (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'];
        if (apiKey && config.intelligenceIngestApiKey && apiKey === config.intelligenceIngestApiKey) {
            req.intelligenceIngestKey = true;
            return next();
        }

        let token;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }
        if (!token) {
            throw new AppError('Not authorized: Bearer token or X-Api-Key required', 401);
        }

        const decoded = jwt.verify(token, config.jwtSecret);
        const user = await User.findById(decoded.id);
        if (!user) {
            throw new AppError('The user belonging to this token does no longer exist.', 401);
        }
        req.user = user;
        next();
    } catch (err) {
        next(err instanceof AppError ? err : new AppError(err.message || 'Not authorized', 401));
    }
};

module.exports = { intelligenceIngestAuth };
