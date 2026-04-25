const express = require('express');
const router = express.Router();
const zoneController = require('../controllers/zone.controller');
const { optionalAuth, requireAuth } = require('../middlewares/auth.middleware');
const {
    zoneScanIpRateLimiter,
    zoneScanDeviceRateLimiter,
    zoneScanUserRateLimiter,
    zoneDownloadIpRateLimiter,
    zoneDownloadDeviceRateLimiter,
    zoneDownloadUserRateLimiter
} = require('../middlewares/zone-rate-limit.middleware');

/**
 * Zone Routes
 * Tour packages/zones endpoints
 */

// Scan zone QR code (multi-layer rate limiting)
// Order: IP → Device → Auth → User
router.post(
    '/scan',
    zoneScanIpRateLimiter,      // Layer 1: IP (20/min)
    zoneScanDeviceRateLimiter,  // Layer 2: Device (15/min)
    optionalAuth,                // Auth middleware
    zoneScanUserRateLimiter,    // Layer 3: User (10/min, only if authenticated)
    zoneController.scanZoneQr
);

// Get all active zones (optional auth for access status)
router.get(
    '/',
    optionalAuth,
    zoneController.getAllZones
);

// Get zone by code (optional auth for access status)
router.get(
    '/:code',
    optionalAuth,
    zoneController.getZoneByCode
);

// Download all POIs in zone (multi-layer rate limiting, stricter)
// Order: IP → Device → Auth → User
router.post(
    '/:code/download',
    zoneDownloadIpRateLimiter,      // Layer 1: IP (10/min)
    zoneDownloadDeviceRateLimiter,  // Layer 2: Device (8/min)
    requireAuth,                     // Auth required
    zoneDownloadUserRateLimiter,    // Layer 3: User (5/min)
    zoneController.downloadZonePois
);

// Check sync status for zone (offline-first support)
router.get(
    '/:code/check-sync',
    requireAuth,
    zoneController.checkZoneSync
);

module.exports = router;
