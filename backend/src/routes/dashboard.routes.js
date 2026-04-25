const express = require('express');
const { protect } = require('../middlewares/auth.middleware');
const { requireRole, ROLES } = require('../middlewares/rbac.middleware');
const dashboardController = require('../controllers/dashboard.controller');

const router = express.Router();

router.use(protect);
router.use(requireRole(ROLES.ADMIN));

// Demo-optimized dashboard endpoint
router.get('/stats', dashboardController.getDemoStats);
router.get('/analytics', dashboardController.getAnalytics);
router.get('/recent-activity', dashboardController.getRecentActivity);

module.exports = router;
