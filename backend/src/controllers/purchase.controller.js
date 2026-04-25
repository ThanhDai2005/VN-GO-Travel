const purchaseService = require('../services/purchase.service');
const { AppError } = require('../middlewares/error.middleware');

/**
 * Purchase Controller
 * Handles credit-based purchase endpoints
 */

class PurchaseController {
    constructor() {
        this.purchasePoi = this.purchasePoi.bind(this);
        this.purchaseZone = this.purchaseZone.bind(this);
        this.getMyWallet = this.getMyWallet.bind(this);
        this.getMyUnlocks = this.getMyUnlocks.bind(this);
        this.getPurchaseHistory = this.getPurchaseHistory.bind(this);
    }

    /**
     * POST /api/v1/purchase/poi
     * Purchase POI with credits
     */
    async purchasePoi(req, res, next) {
        try {
            const { poiCode } = req.body;
            const userId = req.user._id;

            const result = await purchaseService.purchasePoi(userId, poiCode);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[PURCHASE-CONTROLLER] Purchase POI error:', error);
            next(error);
        }
    }

    /**
     * POST /api/v1/purchase/zone
     * Purchase zone with credits
     */
    async purchaseZone(req, res, next) {
        try {
            const { zoneCode } = req.body;
            const userId = req.user._id;

            const result = await purchaseService.purchaseZone(userId, zoneCode);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[PURCHASE-CONTROLLER] Purchase zone error:', error);
            next(error);
        }
    }

    /**
     * GET /api/v1/purchase/wallet
     * Get current user's wallet info
     */
    async getMyWallet(req, res, next) {
        try {
            const userId = req.user._id;

            const wallet = await purchaseService.getWalletInfo(userId);

            res.json({
                success: true,
                data: wallet
            });
        } catch (error) {
            console.error('[PURCHASE-CONTROLLER] Get wallet error:', error);
            next(error);
        }
    }

    /**
     * GET /api/v1/purchase/unlocks
     * Get current user's unlocked POIs and zones
     */
    async getMyUnlocks(req, res, next) {
        try {
            const userId = req.user._id;

            const unlocks = await purchaseService.getUserUnlocks(userId);

            res.json({
                success: true,
                data: unlocks
            });
        } catch (error) {
            console.error('[PURCHASE-CONTROLLER] Get unlocks error:', error);
            next(error);
        }
    }

    /**
     * GET /api/v1/purchase/history
     * Get current user's purchase history
     */
    async getPurchaseHistory(req, res, next) {
        try {
            const userId = req.user._id;
            const limit = parseInt(req.query.limit) || 50;

            const history = await purchaseService.getPurchaseHistory(userId, limit);

            res.json({
                success: true,
                data: history
            });
        } catch (error) {
            console.error('[PURCHASE-CONTROLLER] Get history error:', error);
            next(error);
        }
    }
}

module.exports = new PurchaseController();
