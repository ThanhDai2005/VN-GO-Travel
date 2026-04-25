const express = require('express');
const poiController = require('../controllers/poi.controller');
const { protect } = require('../middlewares/auth.middleware');
const { requireRole, ROLES } = require('../middlewares/rbac.middleware');

const router = express.Router();

/**
 * POI Routes
 *
 * NOTE: POI QR system has been REMOVED.
 * - No /scan endpoint
 * - No QR token generation
 *
 * Use Zone QR system instead: POST /api/v1/zones/scan
 */

router.use(protect);

router.get('/nearby', poiController.getNearby);
router.get('/code/:code', poiController.getByCode);
router.get('/check-sync', poiController.checkSync);

router.post('/', requireRole(ROLES.ADMIN), poiController.create);
router.put('/code/:code', requireRole(ROLES.ADMIN), poiController.updateByCode);
router.delete('/code/:code', requireRole(ROLES.ADMIN), poiController.deleteByCode);

module.exports = router;
