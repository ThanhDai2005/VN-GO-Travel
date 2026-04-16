const express = require('express');
const poiController = require('../controllers/poi.controller');
const { protect, optionalAuth } = require('../middlewares/auth.middleware');
const { requireRole, ROLES } = require('../middlewares/rbac.middleware');

const router = express.Router();

// Allow guest scan for secure/static QR. req.user is attached when JWT exists.
router.post('/scan', optionalAuth, poiController.scan);

router.use(protect);

router.get('/nearby', poiController.getNearby);
router.get('/code/:code', poiController.getByCode);

router.post('/', requireRole(ROLES.ADMIN), poiController.create);
router.put('/code/:code', requireRole(ROLES.ADMIN), poiController.updateByCode);
router.delete('/code/:code', requireRole(ROLES.ADMIN), poiController.deleteByCode);

module.exports = router;
