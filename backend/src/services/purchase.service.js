const mongoose = require('mongoose');
const walletRepository = require('../repositories/user-wallet.repository');
const unlockRepository = require('../repositories/unlock.repository');
const zoneRepository = require('../repositories/zone.repository');
const poiRepository = require('../repositories/poi.repository');
const CreditTransaction = require('../models/credit-transaction.model');
const { AppError } = require('../middlewares/error.middleware');

/**
 * Purchase Service
 * Handles atomic credit transactions for POI and Zone purchases
 */

class PurchaseService {
    /**
     * Purchase POI with credits (atomic transaction)
     */
    async purchasePoi(userId, poiCode) {
        const startTime = Date.now();
        const EventLogger = require('./event-logger.service');
        const session = await mongoose.startSession();

        try {
            let result;

            await session.withTransaction(async () => {
                // 1. Check if already unlocked
                const alreadyUnlocked = await unlockRepository.isPoiUnlocked(userId, poiCode);
                if (alreadyUnlocked) {
                    throw new AppError('POI already unlocked', 400);
                }

                // 2. Get POI and validate
                const poi = await poiRepository.findByCode(poiCode);
                if (!poi) {
                    throw new AppError('POI not found', 404);
                }

                if (!poi.isPremiumOnly) {
                    throw new AppError('This POI is free and does not require purchase', 400);
                }

                const price = poi.unlockPrice || 1;

                // 3. Get wallet with current version
                const wallet = await walletRepository.getOrCreate(userId);

                if (wallet.balance < price) {
                    throw new AppError(
                        `Insufficient credits. Required: ${price}, Available: ${wallet.balance}`,
                        402
                    );
                }

                // 4. Deduct credits atomically (with optimistic locking)
                const updatedWallet = await walletRepository.deductCreditsAtomic(
                    userId,
                    price,
                    wallet.version,
                    { session }
                );

                if (!updatedWallet) {
                    throw new AppError(
                        'Concurrent transaction detected. Please try again.',
                        409
                    );
                }

                // 5. Unlock POI
                await unlockRepository.unlockPoi(userId, poiCode, price, { session });

                // 6. Record transaction
                await CreditTransaction.record({
                    userId,
                    type: 'purchase_poi',
                    amount: -price,
                    balanceBefore: wallet.balance,
                    balanceAfter: updatedWallet.balance,
                    relatedEntity: poiCode,
                    metadata: {
                        poiName: poi.name,
                        poiCode: poi.code
                    }
                }, { session });

                result = {
                    success: true,
                    message: 'POI unlocked successfully',
                    poiCode,
                    price,
                    newBalance: updatedWallet.balance
                };

                console.log(`[PURCHASE] User ${userId} purchased POI ${poiCode} for ${price} credits`);
            });

            // Log successful unlock
            await EventLogger.logPoiUnlock(
                userId,
                result.poi?._id,
                'SUCCESS',
                {
                    poiCode,
                    creditAmount: result.price,
                    responseTime: Date.now() - startTime
                }
            );

            return result;
        } catch (error) {
            // Log failed unlock
            await EventLogger.logPoiUnlock(
                userId,
                null,
                'FAILED',
                {
                    poiCode,
                    responseTime: Date.now() - startTime,
                    errorMessage: error.message
                }
            );

            if (error instanceof AppError) {
                throw error;
            }
            console.error('[PURCHASE] POI purchase failed:', error);
            throw new AppError('Failed to purchase POI', 500);
        } finally {
            session.endSession();
        }
    }

    /**
     * Purchase Zone with credits (atomic transaction)
     * Unlocks all POIs in the zone
     */
    async purchaseZone(userId, zoneCode) {
        const startTime = Date.now();
        const EventLogger = require('./event-logger.service');
        const session = await mongoose.startSession();

        try {
            let result;

            await session.withTransaction(async () => {
                // 1. Check if already unlocked
                const alreadyUnlocked = await unlockRepository.isZoneUnlocked(userId, zoneCode);
                if (alreadyUnlocked) {
                    throw new AppError('Zone already unlocked', 400);
                }

                // 2. Get zone and validate
                const zone = await zoneRepository.findByCode(zoneCode);
                if (!zone) {
                    throw new AppError('Zone not found', 404);
                }

                if (!zone.isActive) {
                    throw new AppError('Zone is not available for purchase', 400);
                }

                const price = zone.price;

                // 3. Get wallet with current version
                const wallet = await walletRepository.getOrCreate(userId);

                if (wallet.balance < price) {
                    throw new AppError(
                        `Insufficient credits. Required: ${price}, Available: ${wallet.balance}`,
                        402
                    );
                }

                // 4. Deduct credits atomically (with optimistic locking)
                const updatedWallet = await walletRepository.deductCreditsAtomic(
                    userId,
                    price,
                    wallet.version,
                    { session }
                );

                if (!updatedWallet) {
                    throw new AppError(
                        'Concurrent transaction detected. Please try again.',
                        409
                    );
                }

                // 5. Unlock zone
                await unlockRepository.unlockZone(userId, zoneCode, price, { session });

                // 6. Unlock all POIs in the zone (idempotent)
                const poiCodes = zone.poiCodes || [];
                for (const poiCode of poiCodes) {
                    try {
                        await unlockRepository.unlockPoi(userId, poiCode, 0, { session });
                    } catch (error) {
                        // Ignore duplicate key errors (POI already unlocked)
                        if (error.code !== 11000) {
                            throw error;
                        }
                    }
                }

                // 7. Record transaction
                await CreditTransaction.record({
                    userId,
                    type: 'purchase_zone',
                    amount: -price,
                    balanceBefore: wallet.balance,
                    balanceAfter: updatedWallet.balance,
                    relatedEntity: zoneCode,
                    metadata: {
                        zoneName: zone.name,
                        zoneCode: zone.code,
                        poiCount: poiCodes.length,
                        unlockedPois: poiCodes
                    }
                }, { session });

                result = {
                    success: true,
                    message: 'Zone unlocked successfully',
                    zoneCode,
                    price,
                    unlockedPois: poiCodes.length,
                    newBalance: updatedWallet.balance,
                    zoneId: zone._id
                };

                console.log(`[PURCHASE] User ${userId} purchased zone ${zoneCode} for ${price} credits (${poiCodes.length} POIs unlocked)`);
            });

            // Log successful unlock
            await EventLogger.logZoneUnlock(
                userId,
                result.zoneId,
                'SUCCESS',
                {
                    zoneCode,
                    creditAmount: result.price,
                    responseTime: Date.now() - startTime
                }
            );

            return result;
        } catch (error) {
            // Log failed unlock
            await EventLogger.logZoneUnlock(
                userId,
                null,
                'FAILED',
                {
                    zoneCode,
                    responseTime: Date.now() - startTime,
                    errorMessage: error.message
                }
            );

            if (error instanceof AppError) {
                throw error;
            }
            console.error('[PURCHASE] Zone purchase failed:', error);
            throw new AppError('Failed to purchase zone', 500);
        } finally {
            session.endSession();
        }
    }

    /**
     * Get user's wallet info
     */
    async getWalletInfo(userId) {
        const wallet = await walletRepository.getOrCreate(userId);
        const stats = await CreditTransaction.getStats(userId);

        return {
            balance: wallet.balance,
            currency: wallet.currency,
            lastTransaction: wallet.lastTransaction,
            stats: {
                totalSpent: stats.totalSpent,
                totalEarned: stats.totalEarned,
                purchaseCount: stats.purchaseCount
            }
        };
    }

    /**
     * Get user's unlocks
     */
    async getUserUnlocks(userId) {
        const [unlockedPois, unlockedZones, stats] = await Promise.all([
            unlockRepository.getUnlockedPois(userId),
            unlockRepository.getUnlockedZones(userId),
            unlockRepository.getUserUnlockStats(userId)
        ]);

        return {
            unlockedPois,
            unlockedZones,
            stats
        };
    }

    /**
     * Get purchase history
     */
    async getPurchaseHistory(userId, limit = 50) {
        const history = await unlockRepository.getUserPurchaseHistory(userId, limit);
        return history;
    }
}

module.exports = new PurchaseService();
