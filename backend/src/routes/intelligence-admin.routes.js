const express = require('express');
const intelligenceController = require('../controllers/intelligence.controller');
const intelligenceMetricsController = require('../controllers/intelligence-metrics.controller');
const intelligenceHeatmapController = require('../controllers/intelligence-heatmap.controller');
const { protect } = require('../middlewares/auth.middleware');
const { requireRole, ROLES } = require('../middlewares/rbac.middleware');

const router = express.Router();

router.use(protect);
router.use(requireRole(ROLES.ADMIN));

router.get('/summary', intelligenceController.getSummary);
router.get('/journeys/:correlationId', intelligenceController.getJourney);

router.get('/metrics/events-by-family', intelligenceMetricsController.getEventsByFamily);
router.get('/metrics/events-by-auth-state', intelligenceMetricsController.getEventsByAuthState);
router.get('/metrics/timeline', intelligenceMetricsController.getTimeline);
router.get('/metrics/geo-heatmap', intelligenceMetricsController.getGeoHeatmap);
router.get('/metrics/overview', intelligenceMetricsController.getOverview);
router.get('/metrics/system-overview', intelligenceMetricsController.getSystemOverview);
router.get('/metrics/revenue', intelligenceMetricsController.getRevenueAnalytics);
router.get('/heatmap', intelligenceHeatmapController.getAdminHeatmap);

module.exports = router;
