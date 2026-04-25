const rateLimit = require('express-rate-limit');
const config = require('../config');

/**
 * Multi-Layer Rate Limiting for Zone Endpoints
 *
 * THREE INDEPENDENT LAYERS:
 * 1. IP-based: 20 req/min (prevents IP-level abuse)
 * 2. User-based: 10 req/min (prevents authenticated user abuse)
 * 3. Device-based: 15 req/min (prevents device-level abuse via X-Device-Id)
 *
 * ALL THREE are checked independently. If ANY limit is exceeded, request is blocked.
 */

/**
 * Layer 1: IP-based Rate Limiter
 * Prevents abuse from single IP address
 */
const ipRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => config.demo?.enabled && config.demo?.skipRateLimits,
    handler: (req, res) => {
        console.warn(`[RATE-LIMIT] IP limit exceeded: ${req.ip}`);
        res.status(429).json({
            success: false,
            error: {
                message: 'Too many requests from this IP. Please try again in a minute.',
                statusCode: 429,
                retryAfter: 60,
                limitType: 'ip'
            }
        });
    }
});

/**
 * Layer 2: User-based Rate Limiter
 * Prevents abuse from authenticated users (stricter limit)
 * MUST be applied AFTER auth middleware
 */
const userRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    keyGenerator: (req) => {
        // Only apply to authenticated users
        if (req.user && req.user._id) {
            return `user:${req.user._id.toString()}`;
        }
        // Skip for unauthenticated (will be caught by IP limiter)
        return null;
    },
    skip: (req) => {
        // Skip if not authenticated OR demo mode
        return !req.user || (config.demo?.enabled && config.demo?.skipRateLimits);
    },
    handler: (req, res) => {
        console.warn(`[RATE-LIMIT] User limit exceeded: ${req.user?._id}`);
        res.status(429).json({
            success: false,
            error: {
                message: 'Too many requests from your account. Please try again in a minute.',
                statusCode: 429,
                retryAfter: 60,
                limitType: 'user'
            }
        });
    },
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * Layer 3: Device-based Rate Limiter
 * Prevents abuse from single device (via X-Device-Id header)
 */
const deviceRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    keyGenerator: (req) => {
        const deviceId = req.headers['x-device-id'];
        if (deviceId && typeof deviceId === 'string' && deviceId.length > 0) {
            return `device:${deviceId}`;
        }
        // Skip if no device ID provided
        return null;
    },
    skip: (req) => {
        // Skip if no device ID OR demo mode
        return !req.headers['x-device-id'] || (config.demo?.enabled && config.demo?.skipRateLimits);
    },
    handler: (req, res) => {
        console.warn(`[RATE-LIMIT] Device limit exceeded: ${req.headers['x-device-id']}`);
        res.status(429).json({
            success: false,
            error: {
                message: 'Too many requests from this device. Please try again in a minute.',
                statusCode: 429,
                retryAfter: 60,
                limitType: 'device'
            }
        });
    },
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * Zone Scan Rate Limiters (all 3 layers)
 * Apply in order: IP → Device → [Auth] → User
 */
const zoneScanRateLimiters = {
    ip: ipRateLimiter,
    device: deviceRateLimiter,
    user: userRateLimiter
};

/**
 * Zone Download Rate Limiters (stricter limits)
 */
const zoneDownloadIpRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10, // Stricter for downloads
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => config.demo?.enabled && config.demo?.skipRateLimits,
    handler: (req, res) => {
        console.warn(`[RATE-LIMIT] Download IP limit exceeded: ${req.ip}`);
        res.status(429).json({
            success: false,
            error: {
                message: 'Too many download requests from this IP. Please try again in a minute.',
                statusCode: 429,
                retryAfter: 60,
                limitType: 'ip'
            }
        });
    }
});

const zoneDownloadUserRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5, // Very strict for authenticated downloads
    keyGenerator: (req) => {
        if (req.user && req.user._id) {
            return `user:${req.user._id.toString()}`;
        }
        return null;
    },
    skip: (req) => !req.user || (config.demo?.enabled && config.demo?.skipRateLimits),
    handler: (req, res) => {
        console.warn(`[RATE-LIMIT] Download user limit exceeded: ${req.user?._id}`);
        res.status(429).json({
            success: false,
            error: {
                message: 'Too many download requests from your account. Please try again in a minute.',
                statusCode: 429,
                retryAfter: 60,
                limitType: 'user'
            }
        });
    },
    standardHeaders: true,
    legacyHeaders: false
});

const zoneDownloadDeviceRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 8,
    keyGenerator: (req) => {
        const deviceId = req.headers['x-device-id'];
        if (deviceId && typeof deviceId === 'string' && deviceId.length > 0) {
            return `device:${deviceId}`;
        }
        return null;
    },
    skip: (req) => !req.headers['x-device-id'] || (config.demo?.enabled && config.demo?.skipRateLimits),
    handler: (req, res) => {
        console.warn(`[RATE-LIMIT] Download device limit exceeded: ${req.headers['x-device-id']}`);
        res.status(429).json({
            success: false,
            error: {
                message: 'Too many download requests from this device. Please try again in a minute.',
                statusCode: 429,
                retryAfter: 60,
                limitType: 'device'
            }
        });
    },
    standardHeaders: true,
    legacyHeaders: false
});

const zoneDownloadRateLimiters = {
    ip: zoneDownloadIpRateLimiter,
    device: zoneDownloadDeviceRateLimiter,
    user: zoneDownloadUserRateLimiter
};

module.exports = {
    // Scan limiters
    zoneScanRateLimiters,
    zoneScanIpRateLimiter: zoneScanRateLimiters.ip,
    zoneScanDeviceRateLimiter: zoneScanRateLimiters.device,
    zoneScanUserRateLimiter: zoneScanRateLimiters.user,

    // Download limiters
    zoneDownloadRateLimiters,
    zoneDownloadIpRateLimiter: zoneDownloadRateLimiters.ip,
    zoneDownloadDeviceRateLimiter: zoneDownloadRateLimiters.device,
    zoneDownloadUserRateLimiter: zoneDownloadRateLimiters.user,

    // Legacy exports (deprecated)
    zoneScanRateLimiter: zoneScanRateLimiters.ip,
    zoneDownloadRateLimiter: zoneDownloadRateLimiters.ip
};
