const userRepository = require('../repositories/user.repository');
const poiRepository = require('../repositories/poi.repository');
const unlockRepository = require('../repositories/unlock.repository');
const zoneRepository = require('../repositories/zone.repository');
const { AppError } = require('../middlewares/error.middleware');

/**
 * Access Control Service
 * Determines if user can access premium POI content
 */

// Access reason constants
const ACCESS_REASONS = {
    FREE_POI: 'FREE_POI',
    PREMIUM_USER: 'PREMIUM_USER',
    POI_PURCHASED: 'POI_PURCHASED',
    ZONE_PURCHASED: 'ZONE_PURCHASED',
    LOCKED: 'LOCKED',
    INACTIVE: 'INACTIVE',
    AUTH_REQUIRED: 'AUTH_REQUIRED'
};

class AccessControlService {
    /**
     * Check if user can access POI
     * Priority: Premium > Free POI > POI Purchase > Zone Purchase > Locked
     */
    async canAccessPoi(userId, poiCode) {
        try {
            // 1. Get POI
            const poi = await poiRepository.findByCode(poiCode);
            if (!poi) {
                throw new AppError('POI not found', 404);
            }

            // 2. If POI is free (not premium-only), allow access
            if (!poi.isPremiumOnly) {
                return {
                    allowed: true,
                    reason: ACCESS_REASONS.FREE_POI,
                    message: 'This POI is free for all users'
                };
            }

            // 3. If user is not authenticated, deny
            if (!userId) {
                return {
                    allowed: false,
                    reason: ACCESS_REASONS.AUTH_REQUIRED,
                    message: 'Authentication required',
                    unlockPrice: poi.unlockPrice || 1
                };
            }

            // 4. Check if user is premium
            const user = await userRepository.findById(userId);
            if (user && user.isPremium) {
                return {
                    allowed: true,
                    reason: ACCESS_REASONS.PREMIUM_USER,
                    message: 'Premium user has access to all content'
                };
            }

            // 5. Check if user has unlocked this specific POI
            const poiUnlocked = await unlockRepository.isPoiUnlocked(userId, poiCode);
            if (poiUnlocked) {
                return {
                    allowed: true,
                    reason: ACCESS_REASONS.POI_PURCHASED,
                    message: 'POI unlocked via direct purchase'
                };
            }

            // 6. Check if user has unlocked a zone containing this POI
            const zones = await zoneRepository.findZonesContainingPoi(poiCode);
            for (const zone of zones) {
                const zoneUnlocked = await unlockRepository.isZoneUnlocked(userId, zone.code);
                if (zoneUnlocked) {
                    return {
                        allowed: true,
                        reason: ACCESS_REASONS.ZONE_PURCHASED,
                        message: `POI unlocked via zone: ${zone.name}`,
                        zoneCode: zone.code
                    };
                }
            }

            // 7. Otherwise, POI is locked
            return {
                allowed: false,
                reason: ACCESS_REASONS.LOCKED,
                message: 'Purchase required to unlock this POI',
                unlockPrice: poi.unlockPrice || 1,
                availableZones: zones.map(z => ({
                    code: z.code,
                    name: z.name,
                    price: z.price,
                    poiCount: z.poiCount
                }))
            };
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            console.error('[ACCESS-CONTROL] Error checking POI access:', error);
            throw new AppError('Failed to check POI access', 500);
        }
    }

    /**
     * Check if user can access zone
     */
    async canAccessZone(userId, zoneCode) {
        try {
            // 1. Get zone
            const zone = await zoneRepository.findByCode(zoneCode);
            if (!zone) {
                throw new AppError('Zone not found', 404);
            }

            if (!zone.isActive) {
                return {
                    allowed: false,
                    reason: ACCESS_REASONS.INACTIVE,
                    message: 'Zone is not available'
                };
            }

            // 2. If user is not authenticated, deny
            if (!userId) {
                return {
                    allowed: false,
                    reason: ACCESS_REASONS.AUTH_REQUIRED,
                    message: 'Authentication required',
                    price: zone.price
                };
            }

            // 3. Check if user is premium
            const user = await userRepository.findById(userId);
            if (user && user.isPremium) {
                return {
                    allowed: true,
                    reason: ACCESS_REASONS.PREMIUM_USER,
                    message: 'Premium user has access to all zones'
                };
            }

            // 4. Check if user has unlocked this zone
            const zoneUnlocked = await unlockRepository.isZoneUnlocked(userId, zoneCode);
            if (zoneUnlocked) {
                return {
                    allowed: true,
                    reason: ACCESS_REASONS.ZONE_PURCHASED,
                    message: 'Zone unlocked via purchase'
                };
            }

            // 5. Otherwise, zone is locked
            return {
                allowed: false,
                reason: ACCESS_REASONS.LOCKED,
                message: 'Purchase required to unlock this zone',
                price: zone.price,
                poiCount: zone.poiCount
            };
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            console.error('[ACCESS-CONTROL] Error checking zone access:', error);
            throw new AppError('Failed to check zone access', 500);
        }
    }

    /**
     * Batch check access for multiple POIs
     */
    async batchCheckPoiAccess(userId, poiCodes) {
        const results = {};

        for (const poiCode of poiCodes) {
            try {
                results[poiCode] = await this.canAccessPoi(userId, poiCode);
            } catch (error) {
                results[poiCode] = {
                    allowed: false,
                    reason: 'error',
                    message: error.message
                };
            }
        }

        return results;
    }

    /**
     * Get access summary for user
     */
    async getAccessSummary(userId) {
        if (!userId) {
            return {
                isPremium: false,
                unlockedPois: [],
                unlockedZones: [],
                hasUnlimitedAccess: false
            };
        }

        const [user, unlockedPois, unlockedZones] = await Promise.all([
            userRepository.findById(userId),
            unlockRepository.getUnlockedPois(userId),
            unlockRepository.getUnlockedZones(userId)
        ]);

        return {
            isPremium: user ? user.isPremium : false,
            unlockedPois,
            unlockedZones,
            hasUnlimitedAccess: user ? user.isPremium : false,
            totalUnlocked: unlockedPois.length + unlockedZones.length
        };
    }
}

module.exports = new AccessControlService();
module.exports.ACCESS_REASONS = ACCESS_REASONS;
