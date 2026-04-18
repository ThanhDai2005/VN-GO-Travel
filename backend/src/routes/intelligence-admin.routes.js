const express = require('express');
const intelligenceController = require('../controllers/intelligence.controller');
const { protect } = require('../middlewares/auth.middleware');
const { requireRole, ROLES } = require('../middlewares/rbac.middleware');

const router = express.Router();

router.use(protect);
router.use(requireRole(ROLES.ADMIN));

router.get('/summary', intelligenceController.getSummary);
router.get('/journeys/:correlationId', intelligenceController.getJourney);

module.exports = router;
