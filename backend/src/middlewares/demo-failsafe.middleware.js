const config = require('../config');
const logger = require('../utils/logger');

/**
 * SECURITY GUARD: Double-check demo mode cannot run in production
 * This is a defense-in-depth measure in case config validation is bypassed
 */
if (process.env.NODE_ENV === 'production' && config.demo.enabled) {
    throw new Error('FATAL: Demo mode middleware loaded in production environment');
}

/**
 * DEMO MODE FAIL-SAFE MIDDLEWARE
 * Ensures demo never blocks or fails
 *
 * Features:
 * - Auto-retry on transient errors
 * - Graceful degradation
 * - Fallback responses
 * - Skip rate limits in demo mode
 */

class DemoFailSafe {
    /**
     * Skip rate limiting in demo mode
     */
    static skipRateLimitInDemo(req, res, next) {
        if (config.demo.enabled && config.demo.skipRateLimits) {
            // Mark request to skip rate limiting
            req.skipRateLimit = true;
        }
        next();
    }

    /**
     * Auto-grant credits for demo users
     */
    static async autoGrantCreditsInDemo(req, res, next) {
        if (!config.demo.enabled || !config.demo.autoGrantCredits) {
            return next();
        }

        try {
            // Check if user is demo user
            if (req.user && req.user.email === 'demo@vngo.com') {
                const UserWallet = require('../models/user-wallet.model');
                const wallet = await UserWallet.findOne({ userId: req.user._id });

                // Auto-refill if balance is low
                if (wallet && wallet.balance < 1000) {
                    logger.info(`[DEMO] Auto-refilling credits for demo user`);

                    await UserWallet.findOneAndUpdate(
                        { userId: req.user._id },
                        { $inc: { balance: config.demo.autoGrantCredits } }
                    );

                    // Log transaction
                    const CreditTransaction = require('../models/credit-transaction.model');
                    await CreditTransaction.create({
                        userId: req.user._id,
                        amount: config.demo.autoGrantCredits,
                        type: 'CREDIT',
                        description: 'Demo mode auto-refill',
                        balanceBefore: wallet.balance,
                        balanceAfter: wallet.balance + config.demo.autoGrantCredits,
                        metadata: { source: 'demo_auto_refill' }
                    });
                }
            }
        } catch (error) {
            logger.error('[DEMO] Error auto-granting credits:', error);
            // Don't block request on error
        }

        next();
    }

    /**
     * Retry wrapper for critical operations
     */
    static async retryOperation(operation, maxRetries = 3, delayMs = 500) {
        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                logger.warn(`[DEMO] Operation failed (attempt ${attempt}/${maxRetries}):`, error.message);

                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
                }
            }
        }

        throw lastError;
    }

    /**
     * Graceful error handler for demo mode
     */
    static demoErrorHandler(err, req, res, next) {
        if (!config.demo.enabled) {
            return next(err);
        }

        logger.error('[DEMO] Error caught:', err);

        // Provide user-friendly fallback responses
        const fallbackResponses = {
            'QR_SCAN_ERROR': {
                success: false,
                message: 'QR scan temporarily unavailable. Please try again.',
                fallback: true
            },
            'NETWORK_ERROR': {
                success: false,
                message: 'Network connection issue. Retrying automatically...',
                fallback: true
            },
            'AUDIO_ERROR': {
                success: false,
                message: 'Audio temporarily unavailable. Using text narration instead.',
                fallback: true
            },
            'PURCHASE_ERROR': {
                success: false,
                message: 'Purchase processing delayed. Please try again.',
                fallback: true
            }
        };

        // Determine error type
        let errorType = 'UNKNOWN_ERROR';
        if (err.message.includes('QR') || err.message.includes('token')) {
            errorType = 'QR_SCAN_ERROR';
        } else if (err.message.includes('network') || err.message.includes('timeout')) {
            errorType = 'NETWORK_ERROR';
        } else if (err.message.includes('audio') || err.message.includes('TTS')) {
            errorType = 'AUDIO_ERROR';
        } else if (err.message.includes('purchase') || err.message.includes('credit')) {
            errorType = 'PURCHASE_ERROR';
        }

        const fallbackResponse = fallbackResponses[errorType] || {
            success: false,
            message: 'Temporary issue. Please try again.',
            fallback: true
        };

        res.status(200).json(fallbackResponse); // Always 200 in demo mode
    }

    /**
     * Fast mode - reduce artificial delays
     */
    static reducedDelay(normalDelayMs) {
        if (config.demo.enabled && config.demo.fastMode) {
            return Math.min(normalDelayMs / 3, 100); // Max 100ms in fast mode
        }
        return normalDelayMs;
    }

    /**
     * Health check endpoint for demo
     */
    static demoHealthCheck(req, res) {
        res.status(200).json({
            success: true,
            demo: {
                enabled: config.demo.enabled,
                fastMode: config.demo.fastMode,
                autoGrantCredits: config.demo.autoGrantCredits,
                skipRateLimits: config.demo.skipRateLimits
            },
            timestamp: new Date().toISOString()
        });
    }
}

module.exports = DemoFailSafe;
