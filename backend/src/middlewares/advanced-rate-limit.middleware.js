const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');
const { AppError } = require('./error.middleware');
const config = require('../config');
const { getClientIP } = require('../utils/ip-helper');

/**
 * Advanced Rate Limiting Middleware
 * Redis-based distributed rate limiting with endpoint-specific limits
 * IPv4-normalized for consistency
 */

// Initialize Redis client
let redisClient = null;

// Check if Redis is configured
const redisUrl = process.env.REDIS_URL;
if (redisUrl) {
    try {
        redisClient = new Redis(redisUrl, {
            enableOfflineQueue: false,
            maxRetriesPerRequest: 3
        });

        redisClient.on('error', (err) => {
            console.error('[RATE-LIMIT] Redis connection error:', err.message);
        });

        redisClient.on('connect', () => {
            console.log('[RATE-LIMIT] Redis connected successfully');
        });
    } catch (error) {
        console.error('[RATE-LIMIT] Failed to initialize Redis:', error.message);
        redisClient = null;
    }
}

/**
 * Create rate limiter with Redis store (if available) or in-memory fallback
 */
const createRateLimiter = (options) => {
    const limiterConfig = {
        windowMs: options.windowMs || 60 * 1000, // 1 minute default
        max: options.max || 100,
        message: options.message || 'Too many requests, please try again later',
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res, next) => {
            next(new AppError(options.message || 'Too many requests, please try again later', 429));
        },
        skip: (req) => {
            // Skip rate limiting for admin users (optional)
            if (options.skipAdmin && req.user && req.user.role === 'admin') {
                return true;
            }
            return false;
        },
        keyGenerator: options.keyGenerator || ((req) => {
            // Default: IP-based (normalized to IPv4)
            return getClientIP(req);
        })
    };

    // Use Redis store if available
    if (redisClient && redisClient.status === 'ready') {
        limiterConfig.store = new RedisStore({
            client: redisClient,
            prefix: options.prefix || 'rl:',
        });
        console.log(`[RATE-LIMIT] Using Redis store for ${options.prefix || 'default'}`);
    } else {
        console.warn(`[RATE-LIMIT] Redis not available, using in-memory store for ${options.prefix || 'default'}`);
    }

    return rateLimit(limiterConfig);
};

/**
 * Global rate limiter (100 req/min per IP)
 */
const globalRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again after a minute',
    prefix: 'rl:global:'
});

/**
 * QR Scan rate limiter (10/min per user, 20/min per IP)
 */
const qrScanRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 20, // Per IP
    message: 'Too many QR scan attempts, please try again later',
    prefix: 'rl:qr:ip:',
    keyGenerator: (req) => {
        return getClientIP(req);
    }
});

/**
 * QR Scan rate limiter per user (10/min)
 * Only applies to authenticated users
 */
const qrScanUserRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many QR scan attempts, please try again later',
    prefix: 'rl:qr:user:',
    skip: (req) => {
        // Skip if user is not authenticated (let IP limiter handle it)
        return !req.user || !req.user._id;
    },
    keyGenerator: (req) => {
        // User-based only (no IP fallback)
        if (req.user && req.user._id) {
            return `user:${req.user._id}`;
        }
        // This should never happen due to skip, but return unique key just in case
        return `anonymous:${Date.now()}`;
    }
});

/**
 * Invalid QR scan rate limiter (5/min per IP, stricter)
 */
const invalidQrRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many invalid QR scan attempts. Your IP has been temporarily blocked.',
    prefix: 'rl:qr:invalid:',
    keyGenerator: (req) => {
        return getClientIP(req);
    }
});

/**
 * Auth endpoints rate limiter (5/min per IP)
 */
const authRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many authentication attempts, please try again later',
    prefix: 'rl:auth:',
    keyGenerator: (req) => {
        return getClientIP(req);
    }
});

/**
 * Purchase endpoints rate limiter (3/min per user)
 */
const purchaseRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 3,
    message: 'Too many purchase attempts, please try again later',
    prefix: 'rl:purchase:',
    keyGenerator: (req) => {
        if (req.user && req.user._id) {
            return `user:${req.user._id}`;
        }
        return getClientIP(req);
    }
});

/**
 * Device-based QR scan rate limiter (20/min per device)
 */
const qrScanDeviceRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 20,
    message: 'Too many QR scan attempts from this device, please try again later',
    prefix: 'rl:qr:device:',
    keyGenerator: (req) => {
        // Use device ID from header if available, otherwise fall back to IP
        const deviceId = req.headers['x-device-id'] || req.headers['device-id'];
        if (deviceId) {
            return `device:${deviceId}`;
        }
        return getClientIP(req);
    }
});

/**
 * Track invalid QR scan for stricter rate limiting
 */
const trackInvalidQrScan = async (req) => {
    const ip = getClientIP(req);
    const key = `rl:qr:invalid:${ip}`;

    if (redisClient && redisClient.status === 'ready') {
        try {
            const count = await redisClient.incr(key);
            await redisClient.expire(key, 60); // 1 minute TTL

            if (count > 5) {
                console.warn(`[SECURITY] IP ${ip} exceeded invalid QR scan limit (${count} attempts)`);
                return true; // Should block
            }
        } catch (error) {
            console.error('[RATE-LIMIT] Failed to track invalid QR scan:', error.message);
        }
    }

    return false;
};

/**
 * Check device abuse (100+ scans per hour)
 */
const checkDeviceAbuse = async (req) => {
    const deviceId = req.headers['x-device-id'] || req.headers['device-id'];
    if (!deviceId) return false;

    const key = `abuse:device:${deviceId}`;

    if (redisClient && redisClient.status === 'ready') {
        try {
            const count = await redisClient.incr(key);
            await redisClient.expire(key, 3600); // 1 hour TTL

            if (count > 100) {
                console.warn(`[SECURITY] Device ${deviceId} exceeded abuse threshold (${count} scans/hour)`);
                return true; // Should block
            }
        } catch (error) {
            console.error('[RATE-LIMIT] Failed to check device abuse:', error.message);
        }
    }

    return false;
};

module.exports = {
    globalRateLimiter,
    qrScanRateLimiter,
    qrScanUserRateLimiter,
    qrScanDeviceRateLimiter,
    invalidQrRateLimiter,
    authRateLimiter,
    purchaseRateLimiter,
    trackInvalidQrScan,
    checkDeviceAbuse,
    createRateLimiter
};
