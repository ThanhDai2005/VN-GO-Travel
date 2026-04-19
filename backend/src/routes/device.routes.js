const express = require('express');
const deviceController = require('../controllers/device.controller');
const { optionalAuth, protect } = require('../middlewares/auth.middleware');
const { requireRole, ROLES } = require('../middlewares/rbac.middleware');

const router = express.Router();

// Public/guest allowed, user is attached when JWT exists.
router.post('/heartbeat', optionalAuth, deviceController.heartbeat);
router.post('/offline', optionalAuth, deviceController.offline);

// Admin monitor
router.get('/admin/list', protect, requireRole(ROLES.ADMIN), deviceController.adminList);

module.exports = router;
