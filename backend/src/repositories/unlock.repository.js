const UserUnlockPoi = require('../models/user-unlock-poi.model');
const UserUnlockZone = require('../models/user-unlock-zone.model');
const { AppError } = require('../middlewares/error.middleware');

/**
 * Unlock Repository
 * Handles POI and Zone unlock operations
 */

class UnlockRepository {
    /**
     * Check if POI is unlocked for user
     */
    async isPoiUnlocked(userId, poiCode) {
        const unlocked = await UserUnlockPoi.isUnlocked(userId, poiCode.toUpperCase());
        return unlocked;
    }

    /**
     * Check if zone is unlocked for user
     */
    async isZoneUnlocked(userId, zoneCode) {
        const unlocked = await UserUnlockZone.isUnlocked(userId, zoneCode.toUpperCase());
        return unlocked;
    }

    /**
     * Unlock POI for user (idempotent)
     */
    async unlockPoi(userId, poiCode, price, options = {}) {
        try {
            const unlock = await UserUnlockPoi.unlockPoi(
                userId,
                poiCode.toUpperCase(),
                price,
                options
            );

            console.log(`[UNLOCK] User ${userId} unlocked POI ${poiCode}`);

            return unlock;
        } catch (error) {
            console.error('[UNLOCK] Failed to unlock POI:', error);
            throw new AppError('Failed to unlock POI', 500);
        }
    }

    /**
     * Unlock zone for user (idempotent)
     */
    async unlockZone(userId, zoneCode, price, options = {}) {
        try {
            const unlock = await UserUnlockZone.unlockZone(
                userId,
                zoneCode.toUpperCase(),
                price,
                options
            );

            console.log(`[UNLOCK] User ${userId} unlocked zone ${zoneCode}`);

            return unlock;
        } catch (error) {
            console.error('[UNLOCK] Failed to unlock zone:', error);
            throw new AppError('Failed to unlock zone', 500);
        }
    }

    /**
     * Get all unlocked POIs for user
     */
    async getUnlockedPois(userId) {
        const poiCodes = await UserUnlockPoi.getUnlockedPois(userId);
        return poiCodes;
    }

    /**
     * Get all unlocked zones for user
     */
    async getUnlockedZones(userId) {
        const zoneCodes = await UserUnlockZone.getUnlockedZones(userId);
        return zoneCodes;
    }

    /**
     * Get unlock details for POI
     */
    async getPoiUnlockDetails(userId, poiCode) {
        const unlock = await UserUnlockPoi.findOne({
            userId,
            poiCode: poiCode.toUpperCase()
        });

        return unlock;
    }

    /**
     * Get unlock details for zone
     */
    async getZoneUnlockDetails(userId, zoneCode) {
        const unlock = await UserUnlockZone.findOne({
            userId,
            zoneCode: zoneCode.toUpperCase()
        });

        return unlock;
    }

    /**
     * Get user's purchase history
     */
    async getUserPurchaseHistory(userId, limit = 50) {
        const [poiUnlocks, zoneUnlocks] = await Promise.all([
            UserUnlockPoi.find({ userId })
                .sort({ purchasedAt: -1 })
                .limit(limit),
            UserUnlockZone.find({ userId })
                .sort({ purchasedAt: -1 })
                .limit(limit)
        ]);

        // Combine and sort by purchase date
        const combined = [
            ...poiUnlocks.map(u => ({
                type: 'poi',
                code: u.poiCode,
                price: u.purchasePrice,
                purchasedAt: u.purchasedAt
            })),
            ...zoneUnlocks.map(u => ({
                type: 'zone',
                code: u.zoneCode,
                price: u.purchasePrice,
                purchasedAt: u.purchasedAt
            }))
        ];

        combined.sort((a, b) => b.purchasedAt - a.purchasedAt);

        return combined.slice(0, limit);
    }

    /**
     * Get unlock statistics for user
     */
    async getUserUnlockStats(userId) {
        const [poiCount, zoneCount, poiUnlocks, zoneUnlocks] = await Promise.all([
            UserUnlockPoi.countDocuments({ userId }),
            UserUnlockZone.countDocuments({ userId }),
            UserUnlockPoi.find({ userId }),
            UserUnlockZone.find({ userId })
        ]);

        const totalSpent = [
            ...poiUnlocks.map(u => u.purchasePrice),
            ...zoneUnlocks.map(u => u.purchasePrice)
        ].reduce((sum, price) => sum + price, 0);

        return {
            unlockedPois: poiCount,
            unlockedZones: zoneCount,
            totalPurchases: poiCount + zoneCount,
            totalSpent
        };
    }
}

module.exports = new UnlockRepository();
