const SystemEvent = require('../models/system-event.model');
const logger = require('../utils/logger');

/**
 * EVENT LOGGING SERVICE
 * Centralized event tracking for system observability
 *
 * Usage:
 *   await EventLogger.logQrScan(userId, poiId, 'SUCCESS', metadata);
 *   await EventLogger.logZoneUnlock(userId, zoneId, 'SUCCESS', metadata);
 */

class EventLogger {
    /**
     * Log QR scan event
     */
    async logQrScan(userId, poiId, status, metadata = {}) {
        try {
            await SystemEvent.create({
                eventType: status === 'SUCCESS' ? 'QR_SCAN' : 'QR_SCAN_FAILED',
                userId,
                poiId,
                status,
                metadata: {
                    poiCode: metadata.poiCode,
                    qrToken: metadata.qrToken,
                    ipAddress: metadata.ipAddress,
                    deviceId: metadata.deviceId,
                    responseTime: metadata.responseTime,
                    errorMessage: metadata.errorMessage,
                    errorCode: metadata.errorCode
                }
            });

            logger.info(`[EVENT] QR_SCAN - User: ${userId}, POI: ${poiId}, Status: ${status}`);
        } catch (error) {
            logger.error('[EVENT] Failed to log QR scan event:', error);
        }
    }

    /**
     * Log zone unlock event
     */
    async logZoneUnlock(userId, zoneId, status, metadata = {}) {
        try {
            await SystemEvent.create({
                eventType: 'ZONE_UNLOCK',
                userId,
                zoneId,
                status,
                metadata: {
                    zoneCode: metadata.zoneCode,
                    creditAmount: metadata.creditAmount,
                    responseTime: metadata.responseTime,
                    errorMessage: metadata.errorMessage
                }
            });

            logger.info(`[EVENT] ZONE_UNLOCK - User: ${userId}, Zone: ${zoneId}, Status: ${status}`);
        } catch (error) {
            logger.error('[EVENT] Failed to log zone unlock event:', error);
        }
    }

    /**
     * Log POI unlock event
     */
    async logPoiUnlock(userId, poiId, status, metadata = {}) {
        try {
            await SystemEvent.create({
                eventType: 'POI_UNLOCK',
                userId,
                poiId,
                status,
                metadata: {
                    poiCode: metadata.poiCode,
                    creditAmount: metadata.creditAmount,
                    responseTime: metadata.responseTime,
                    errorMessage: metadata.errorMessage
                }
            });

            logger.info(`[EVENT] POI_UNLOCK - User: ${userId}, POI: ${poiId}, Status: ${status}`);
        } catch (error) {
            logger.error('[EVENT] Failed to log POI unlock event:', error);
        }
    }

    /**
     * Log audio playback event
     */
    async logAudioPlay(userId, poiId, status, metadata = {}) {
        try {
            await SystemEvent.create({
                eventType: status === 'SUCCESS' ? 'AUDIO_PLAY' : 'AUDIO_FAILED',
                userId,
                poiId,
                status,
                metadata: {
                    poiCode: metadata.poiCode,
                    responseTime: metadata.responseTime,
                    errorMessage: metadata.errorMessage
                }
            });

            logger.info(`[EVENT] AUDIO_PLAY - User: ${userId}, POI: ${poiId}, Status: ${status}`);
        } catch (error) {
            logger.error('[EVENT] Failed to log audio play event:', error);
        }
    }

    /**
     * Log credit transaction event
     */
    async logCreditTransaction(userId, type, amount, status, metadata = {}) {
        try {
            await SystemEvent.create({
                eventType: type === 'DEBIT' ? 'CREDIT_DEBIT' : 'CREDIT_CREDIT',
                userId,
                status,
                metadata: {
                    creditAmount: amount,
                    poiCode: metadata.poiCode,
                    zoneCode: metadata.zoneCode,
                    responseTime: metadata.responseTime,
                    errorMessage: metadata.errorMessage
                }
            });

            logger.info(`[EVENT] CREDIT_${type} - User: ${userId}, Amount: ${amount}, Status: ${status}`);
        } catch (error) {
            logger.error('[EVENT] Failed to log credit transaction event:', error);
        }
    }

    /**
     * Log API error event
     */
    async logApiError(userId, errorMessage, errorCode, metadata = {}) {
        try {
            await SystemEvent.create({
                eventType: 'API_ERROR',
                userId,
                status: 'FAILED',
                metadata: {
                    errorMessage,
                    errorCode,
                    ipAddress: metadata.ipAddress,
                    userAgent: metadata.userAgent,
                    endpoint: metadata.endpoint,
                    method: metadata.method,
                    responseTime: metadata.responseTime
                }
            });

            logger.error(`[EVENT] API_ERROR - User: ${userId}, Error: ${errorMessage}`);
        } catch (error) {
            logger.error('[EVENT] Failed to log API error event:', error);
        }
    }

    /**
     * Log rate limit hit event
     */
    async logRateLimitHit(userId, metadata = {}) {
        try {
            await SystemEvent.create({
                eventType: 'RATE_LIMIT_HIT',
                userId,
                status: 'FAILED',
                metadata: {
                    ipAddress: metadata.ipAddress,
                    deviceId: metadata.deviceId,
                    endpoint: metadata.endpoint
                }
            });

            logger.warn(`[EVENT] RATE_LIMIT_HIT - User: ${userId}, IP: ${metadata.ipAddress}`);
        } catch (error) {
            logger.error('[EVENT] Failed to log rate limit event:', error);
        }
    }

    /**
     * Log authentication event
     */
    async logAuth(userId, status, metadata = {}) {
        try {
            await SystemEvent.create({
                eventType: status === 'SUCCESS' ? 'AUTH_SUCCESS' : 'AUTH_FAILED',
                userId,
                status,
                metadata: {
                    ipAddress: metadata.ipAddress,
                    userAgent: metadata.userAgent,
                    errorMessage: metadata.errorMessage
                }
            });

            logger.info(`[EVENT] AUTH - User: ${userId}, Status: ${status}`);
        } catch (error) {
            logger.error('[EVENT] Failed to log auth event:', error);
        }
    }

    /**
     * Get recent events (for debugging)
     */
    async getRecentEvents(limit = 100, filters = {}) {
        try {
            const query = {};

            if (filters.eventType) query.eventType = filters.eventType;
            if (filters.userId) query.userId = filters.userId;
            if (filters.status) query.status = filters.status;
            if (filters.startDate) query.timestamp = { $gte: new Date(filters.startDate) };

            return await SystemEvent.find(query)
                .sort({ timestamp: -1 })
                .limit(limit)
                .populate('userId', 'email fullName')
                .populate('poiId', 'code name')
                .populate('zoneId', 'code name')
                .lean();
        } catch (error) {
            logger.error('[EVENT] Failed to get recent events:', error);
            return [];
        }
    }

    /**
     * Get event statistics
     */
    async getEventStats(startDate, endDate) {
        try {
            const match = {
                timestamp: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                }
            };

            const stats = await SystemEvent.aggregate([
                { $match: match },
                {
                    $group: {
                        _id: '$eventType',
                        count: { $sum: 1 },
                        successCount: {
                            $sum: { $cond: [{ $eq: ['$status', 'SUCCESS'] }, 1, 0] }
                        },
                        failedCount: {
                            $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] }
                        },
                        avgResponseTime: { $avg: '$metadata.responseTime' }
                    }
                },
                { $sort: { count: -1 } }
            ]);

            return stats;
        } catch (error) {
            logger.error('[EVENT] Failed to get event stats:', error);
            return [];
        }
    }

    /**
     * Get error summary
     */
    async getErrorSummary(limit = 10) {
        try {
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

            return await SystemEvent.find({
                status: 'FAILED',
                timestamp: { $gte: oneDayAgo }
            })
                .sort({ timestamp: -1 })
                .limit(limit)
                .populate('userId', 'email')
                .select('eventType userId metadata.errorMessage metadata.errorCode timestamp')
                .lean();
        } catch (error) {
            logger.error('[EVENT] Failed to get error summary:', error);
            return [];
        }
    }
}

module.exports = new EventLogger();
