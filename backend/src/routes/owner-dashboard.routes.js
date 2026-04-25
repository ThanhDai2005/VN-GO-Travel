const express = require('express');
const router = express.Router();
const ownerDashboardController = require('../controllers/owner-dashboard.controller');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');
const { ROLES } = require('../constants/roles');

/**
 * Owner Dashboard Routes
 * High-performance analytics endpoints
 *
 * All routes require authentication
 * Some routes require specific roles (OWNER, ADMIN)
 */

// POI Overview - Owner can view their own POIs
router.get(
    '/poi/:code',
    requireAuth,
    ownerDashboardController.getPoiOverview
);

// Top POIs - Admin only
router.get(
    '/top-pois',
    requireAuth,
    requireRole(ROLES.ADMIN),
    ownerDashboardController.getTopPois
);

// Trends - Owner can view their own POIs
router.get(
    '/trends/:poiId',
    requireAuth,
    ownerDashboardController.getTrends
);

// Heatmap - Owner can view their own POIs
router.get(
    '/heatmap/:poiId',
    requireAuth,
    ownerDashboardController.getHeatmap
);

// Clear cache - Admin only
router.post(
    '/cache/clear',
    requireAuth,
    requireRole(ROLES.ADMIN),
    ownerDashboardController.clearCache
);

module.exports = router;
