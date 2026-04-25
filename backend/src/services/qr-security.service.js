const QrTokenUsage = require('../models/qr-token-usage.model');
const { AppError } = require('../middlewares/error.middleware');

/**
 * QR Security Service
 * Tracks token usage, detects abuse, and manages blacklist
 */

class QrSecurityService {
    /**
     * Track QR token scan
     */
    async trackScan(token, poiCode, userId, ip, deviceId) {
        try {
            // Find or create token usage record
            const usage = await QrTokenUsage.findOrCreate(token, poiCode);

            // Check if token is blacklisted
            if (usage.blacklisted) {
                console.warn(`[QR-SECURITY] Blocked scan attempt for blacklisted token: ${token.substring(0, 20)}...`);
                throw new AppError(
                    `This QR code has been disabled. Reason: ${usage.blacklistedReason || 'Security violation'}`,
                    403
                );
            }

            // Record the scan
            await usage.recordScan(userId, ip, deviceId);

            // Check for abuse patterns
            if (usage.isAbusive) {
                console.warn(`[QR-SECURITY] Abusive token detected: ${token.substring(0, 20)}... (${usage.scanCount} total scans)`);

                // Auto-blacklist if abuse detected
                await usage.blacklist('Automatic: Excessive scan rate detected (>100 scans/hour)', null);

                throw new AppError(
                    'This QR code has been temporarily disabled due to suspicious activity',
                    403
                );
            }

            return {
                success: true,
                scanCount: usage.scanCount,
                isAbusive: usage.isAbusive
            };
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            console.error('[QR-SECURITY] Failed to track scan:', error);
            // Don't block legitimate scans if tracking fails
            return { success: true, scanCount: 0, isAbusive: false };
        }
    }

    /**
     * Check if token is blacklisted
     */
    async isBlacklisted(token) {
        try {
            const usage = await QrTokenUsage.findOne({ token, blacklisted: true });
            return usage !== null;
        } catch (error) {
            console.error('[QR-SECURITY] Failed to check blacklist:', error);
            return false;
        }
    }

    /**
     * Blacklist token (admin action)
     */
    async blacklistToken(token, reason, adminUserId) {
        try {
            const usage = await QrTokenUsage.findOne({ token });

            if (!usage) {
                throw new AppError('Token not found in usage records', 404);
            }

            if (usage.blacklisted) {
                throw new AppError('Token is already blacklisted', 400);
            }

            await usage.blacklist(reason, adminUserId);

            console.log(`[QR-SECURITY] Token blacklisted by admin ${adminUserId}: ${token.substring(0, 20)}...`);

            return {
                success: true,
                message: 'Token blacklisted successfully',
                token: usage
            };
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            console.error('[QR-SECURITY] Failed to blacklist token:', error);
            throw new AppError('Failed to blacklist token', 500);
        }
    }

    /**
     * Unblacklist token (admin action)
     */
    async unblacklistToken(token, adminUserId) {
        try {
            const usage = await QrTokenUsage.findOne({ token });

            if (!usage) {
                throw new AppError('Token not found in usage records', 404);
            }

            if (!usage.blacklisted) {
                throw new AppError('Token is not blacklisted', 400);
            }

            await usage.unblacklist();

            console.log(`[QR-SECURITY] Token unblacklisted by admin ${adminUserId}: ${token.substring(0, 20)}...`);

            return {
                success: true,
                message: 'Token unblacklisted successfully',
                token: usage
            };
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            console.error('[QR-SECURITY] Failed to unblacklist token:', error);
            throw new AppError('Failed to unblacklist token', 500);
        }
    }

    /**
     * Get token usage statistics
     */
    async getTokenUsage(token) {
        try {
            const usage = await QrTokenUsage.findOne({ token });

            if (!usage) {
                return null;
            }

            // Calculate scans in last hour
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const scansLastHour = usage.scanHistory.filter(scan => scan.scannedAt > oneHourAgo).length;

            // Calculate scans in last 24 hours
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const scansLast24Hours = usage.scanHistory.filter(scan => scan.scannedAt > oneDayAgo).length;

            return {
                token: token.substring(0, 20) + '...',
                poiCode: usage.poiCode,
                totalScans: usage.scanCount,
                scansLastHour,
                scansLast24Hours,
                lastScannedAt: usage.lastScannedAt,
                blacklisted: usage.blacklisted,
                blacklistedReason: usage.blacklistedReason,
                blacklistedAt: usage.blacklistedAt,
                isAbusive: usage.isAbusive
            };
        } catch (error) {
            console.error('[QR-SECURITY] Failed to get token usage:', error);
            throw new AppError('Failed to get token usage', 500);
        }
    }

    /**
     * Get all abusive tokens
     */
    async getAbusiveTokens() {
        try {
            const tokens = await QrTokenUsage.getAbusiveTokens();

            return tokens.map(token => ({
                token: token.token.substring(0, 20) + '...',
                poiCode: token.poiCode,
                scanCount: token.scanCount,
                lastScannedAt: token.lastScannedAt,
                blacklisted: token.blacklisted
            }));
        } catch (error) {
            console.error('[QR-SECURITY] Failed to get abusive tokens:', error);
            throw new AppError('Failed to get abusive tokens', 500);
        }
    }

    /**
     * Get usage statistics for POI
     */
    async getPoiUsageStats(poiCode) {
        try {
            const tokens = await QrTokenUsage.find({ poiCode });

            const totalScans = tokens.reduce((sum, token) => sum + token.scanCount, 0);
            const blacklistedCount = tokens.filter(token => token.blacklisted).length;

            return {
                poiCode,
                totalTokens: tokens.length,
                totalScans,
                blacklistedTokens: blacklistedCount,
                activeTokens: tokens.length - blacklistedCount
            };
        } catch (error) {
            console.error('[QR-SECURITY] Failed to get POI usage stats:', error);
            throw new AppError('Failed to get POI usage stats', 500);
        }
    }

    /**
     * Cleanup old scan history (keep last 30 days)
     */
    async cleanupOldHistory() {
        try {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

            const result = await QrTokenUsage.updateMany(
                {},
                {
                    $pull: {
                        scanHistory: {
                            scannedAt: { $lt: thirtyDaysAgo }
                        }
                    }
                }
            );

            console.log(`[QR-SECURITY] Cleaned up old scan history: ${result.modifiedCount} tokens updated`);

            return {
                success: true,
                tokensUpdated: result.modifiedCount
            };
        } catch (error) {
            console.error('[QR-SECURITY] Failed to cleanup old history:', error);
            throw new AppError('Failed to cleanup old history', 500);
        }
    }
}

module.exports = new QrSecurityService();
