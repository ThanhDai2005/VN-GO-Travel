const express = require('express');
const { protect } = require('../middlewares/auth.middleware');
const { requireRole, ROLES } = require('../middlewares/rbac.middleware');
const { createRateLimiter } = require('../middlewares/advanced-rate-limit.middleware');
const monitoringController = require('../controllers/monitoring.controller');

const router = express.Router();

router.use(protect);
router.use(requireRole(ROLES.ADMIN));

// Rate limit monitoring endpoints (10 requests/min per admin)
const monitoringRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many monitoring requests',
    prefix: 'rl:monitoring:',
    keyGenerator: (req) => `admin:${req.user._id}`
});

router.use(monitoringRateLimiter);

// Real-time metrics
router.get('/metrics/current', monitoringController.getCurrentMetrics);
router.get('/metrics/history', monitoringController.getMetricsHistory);
router.get('/metrics/summary', monitoringController.getMetricsSummary);

// Event logs
router.get('/events/recent', monitoringController.getRecentEvents);
router.get('/events/stats', monitoringController.getEventStats);
router.get('/events/errors', monitoringController.getErrorSummary);

// System health
router.get('/health', monitoringController.getSystemHealth);
router.get('/active-users', monitoringController.getActiveUsers);

module.exports = router;
