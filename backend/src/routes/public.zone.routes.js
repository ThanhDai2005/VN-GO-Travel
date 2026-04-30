const express = require('express');
const publicZoneController = require('../controllers/public.zone.controller');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Public Rate Limit: 100 requests per 15 minutes per IP
const publicLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, error: 'Too many requests from this IP, please try again after 15 minutes' },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * @route   GET /api/v1/public/zones/:zoneCode
 * @desc    Get public zone details (Limited & Safe fields)
 * @access  Public
 */
router.get('/:zoneCode', publicLimiter, publicZoneController.getPublicZone);

module.exports = router;
