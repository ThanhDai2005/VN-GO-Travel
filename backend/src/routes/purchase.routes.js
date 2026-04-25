const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchase.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { validateBody, schemas } = require('../middlewares/validation.middleware');
const { purchaseRateLimiter } = require('../middlewares/advanced-rate-limit.middleware');

/**
 * Purchase Routes
 * Credit-based purchase endpoints
 */

// All routes require authentication
router.use(requireAuth);

// Apply purchase rate limiter (3/min per user)
router.use(purchaseRateLimiter);

// Purchase POI
router.post(
    '/poi',
    validateBody(schemas.purchasePoi),
    purchaseController.purchasePoi
);

// Purchase Zone
router.post(
    '/zone',
    validateBody(schemas.purchaseZone),
    purchaseController.purchaseZone
);

// Get wallet info
router.get(
    '/wallet',
    purchaseController.getMyWallet
);

// Get unlocks
router.get(
    '/unlocks',
    purchaseController.getMyUnlocks
);

// Get purchase history
router.get(
    '/history',
    purchaseController.getPurchaseHistory
);

module.exports = router;
