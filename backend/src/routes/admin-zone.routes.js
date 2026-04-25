const express = require('express');
const router = express.Router();
const adminZoneController = require('../controllers/admin-zone.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole, ROLES } = require('../middlewares/rbac.middleware');

/**
 * Admin Zone Routes
 * Admin-only zone management
 */

// All routes require ADMIN role
router.use(requireAuth);
router.use(requireRole(ROLES.ADMIN));

// Get all zones (including inactive)
router.get('/', adminZoneController.getAllZones);

// Create zone
router.post('/', adminZoneController.createZone);

// Update zone
router.put('/:id', adminZoneController.updateZone);

// Delete zone
router.delete('/:id', adminZoneController.deleteZone);

// Update zone POIs
router.put('/:id/pois', adminZoneController.updateZonePois);

// Generate QR token for zone
router.get('/:id/qr-token', adminZoneController.getZoneQrToken);

// Revoke QR token for zone
router.post('/:id/revoke-qr', adminZoneController.revokeZoneQrToken);

module.exports = router;
