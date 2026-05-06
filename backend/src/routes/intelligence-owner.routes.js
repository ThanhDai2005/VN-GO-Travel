const express = require('express');
const router = express.Router();
const intelligenceOwnerController = require('../controllers/intelligence-owner.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

/**
 * Owner Intelligence Analytics Routes
 * All routes require authentication
 */

// Get POI visit statistics
router.get(
    '/poi-visits/:poiId',
    requireAuth,
    intelligenceOwnerController.getPoiVisits
);

// Get audio playback statistics
router.get(
    '/audio-stats/:poiId',
    requireAuth,
    intelligenceOwnerController.getAudioStats
);

// Get visit duration statistics
router.get(
    '/visit-duration/:poiId',
    requireAuth,
    intelligenceOwnerController.getVisitDuration
);

// Get comprehensive POI analytics summary
router.get(
    '/summary/:poiId',
    requireAuth,
    intelligenceOwnerController.getPoiSummary
);

// Get geo heatmap for owner POIs
const intelligenceMetricsController = require('../controllers/intelligence-metrics.controller');
router.get(
    '/metrics/geo-heatmap',
    requireAuth,
    intelligenceMetricsController.getOwnerGeoHeatmap
);

module.exports = router;
