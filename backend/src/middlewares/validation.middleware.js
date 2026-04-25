const Joi = require('joi');
const { AppError } = require('./error.middleware');

/**
 * Validation Middleware
 * Request validation using Joi schemas
 */

// Validation schemas
const schemas = {
    // QR Scan validation
    qrScan: Joi.object({
        token: Joi.string().required().min(10).max(500)
    }),

    // Purchase POI validation
    purchasePoi: Joi.object({
        poiCode: Joi.string().required().pattern(/^[A-Z0-9_]+$/),
    }),

    // Purchase Zone validation
    purchaseZone: Joi.object({
        zoneCode: Joi.string().required().pattern(/^[A-Z0-9_]+$/),
    }),

    // Sync validation
    sync: Joi.object({
        since: Joi.date().iso().optional(),
        lang: Joi.string().pattern(/^[a-z]{2}$/).default('vi')
    }),

    // Grant credits validation (admin)
    grantCredits: Joi.object({
        userId: Joi.string().required().length(24), // MongoDB ObjectId
        amount: Joi.number().integer().min(1).max(1000).required(),
        reason: Joi.string().max(200).optional()
    }),

    // Blacklist token validation (admin)
    blacklistToken: Joi.object({
        token: Joi.string().required().min(10).max(500),
        reason: Joi.string().max(200).required()
    })
};

/**
 * Validate request body
 */
const validateBody = (schema) => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            const errors = error.details.map(detail => detail.message);
            return next(new AppError(`Validation error: ${errors.join(', ')}`, 400));
        }

        req.body = value;
        next();
    };
};

/**
 * Validate query parameters
 */
const validateQuery = (schema) => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.query, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            const errors = error.details.map(detail => detail.message);
            return next(new AppError(`Validation error: ${errors.join(', ')}`, 400));
        }

        req.query = value;
        next();
    };
};

module.exports = {
    schemas,
    validateBody,
    validateQuery
};
