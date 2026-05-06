const express = require('express');
const poiController = require('../controllers/poi.controller');
const { protect, optionalAuth } = require('../middlewares/auth.middleware');
const { requireRole, ROLES } = require('../middlewares/rbac.middleware');

const router = express.Router();

/**
 * POI Routes
 *
 * NOTE: /scan endpoint redirects to Zone QR system for backward compatibility
 * Use Zone QR system: POST /api/v1/zones/scan
 */

// Legacy POI scan endpoint - redirects to zone scan
router.post('/scan', optionalAuth, poiController.scanLegacy);

router.use(protect);

router.get('/nearby', poiController.getNearby);
router.get('/code/:code', poiController.getByCode);
router.get('/:code/zone', poiController.getZoneByCode);
router.get('/check-sync', poiController.checkSync);

router.post('/', requireRole(ROLES.ADMIN), poiController.create);
router.put('/code/:code', requireRole(ROLES.ADMIN), poiController.updateByCode);
router.delete('/code/:code', requireRole(ROLES.ADMIN), poiController.deleteByCode);

// Translation Management (Admin Only)
const poiTranslationController = require('../controllers/poi-translation.controller');
router.get('/code/:code/translations', requireRole(ROLES.ADMIN), poiTranslationController.getAll);
router.get('/code/:code/translations/:lang_code/history', requireRole(ROLES.ADMIN), poiTranslationController.getHistory);
router.post('/code/:code/translations/:lang_code/lock', requireRole(ROLES.ADMIN), poiTranslationController.acquireLock);
router.post('/code/:code/translations/:lang_code/heartbeat', requireRole(ROLES.ADMIN), poiTranslationController.heartbeat);
router.post('/code/:code/translations/:lang_code/unlock', requireRole(ROLES.ADMIN), poiTranslationController.releaseLock);
router.post('/code/:code/translations/:lang_code/rollback/:version', requireRole(ROLES.ADMIN), poiTranslationController.rollback);
router.put('/code/:code/translations/:lang_code', requireRole(ROLES.ADMIN), poiTranslationController.upsert);
router.delete('/code/:code/translations/:lang_code', requireRole(ROLES.ADMIN), poiTranslationController.remove);

module.exports = router;
