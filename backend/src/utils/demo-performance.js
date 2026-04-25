const config = require('../config');
const NodeCache = require('node-cache');

/**
 * DEMO PERFORMANCE OPTIMIZER
 * Aggressive caching and optimization for smooth demo experience
 *
 * Target: API response < 300ms, QR scan < 1s
 */

class DemoPerformanceOptimizer {
    constructor() {
        // Aggressive cache for demo mode (5 minutes TTL)
        this.demoCache = new NodeCache({
            stdTTL: 300,
            checkperiod: 60,
            useClones: false // Better performance
        });

        // Preload cache for frequently accessed data
        this.preloadCache = new Map();
    }

    /**
     * Cache wrapper with demo mode optimization
     */
    async cacheWrapper(key, fetchFunction, ttl = 300) {
        // In demo mode, use aggressive caching
        if (config.demo.enabled) {
            const cached = this.demoCache.get(key);
            if (cached !== undefined) {
                return cached;
            }

            const result = await fetchFunction();
            this.demoCache.set(key, result, ttl);
            return result;
        }

        // Normal mode - fetch directly
        return await fetchFunction();
    }

    /**
     * Preload frequently accessed data
     */
    async preloadDemoData() {
        if (!config.demo.enabled) return;

        console.log('[DEMO PERF] Preloading demo data for fast access...');

        try {
            const User = require('../models/user.model');
            const Poi = require('../models/poi.model');
            const Zone = require('../models/zone.model');

            // Preload demo user
            const demoUser = await User.findOne({ email: 'demo@vngo.com' })
                .select('-password')
                .lean();
            if (demoUser) {
                this.preloadCache.set('demo_user', demoUser);
            }

            // Preload demo POIs
            const demoPois = await Poi.find({ code: /^DEMO_/ })
                .select('code name summary narrationShort narrationLong location radius priority isPremiumOnly status')
                .lean();
            this.preloadCache.set('demo_pois', demoPois);

            // Preload demo zones
            const demoZones = await Zone.find({ code: /^DEMO_/ })
                .select('code name description location radius price isPremiumOnly')
                .lean();
            this.preloadCache.set('demo_zones', demoZones);

            console.log('[DEMO PERF] ✅ Preloaded demo data:', {
                user: !!demoUser,
                pois: demoPois.length,
                zones: demoZones.length
            });
        } catch (error) {
            console.error('[DEMO PERF] Error preloading demo data:', error);
        }
    }

    /**
     * Get preloaded data
     */
    getPreloaded(key) {
        return this.preloadCache.get(key);
    }

    /**
     * Fast POI lookup for demo
     */
    async fastPoiLookup(code) {
        if (!config.demo.enabled || !code.startsWith('DEMO_')) {
            return null;
        }

        const demoPois = this.preloadCache.get('demo_pois') || [];
        return demoPois.find(poi => poi.code === code);
    }

    /**
     * Fast zone lookup for demo
     */
    async fastZoneLookup(code) {
        if (!config.demo.enabled || !code.startsWith('DEMO_')) {
            return null;
        }

        const demoZones = this.preloadCache.get('demo_zones') || [];
        return demoZones.find(zone => zone.code === code);
    }

    /**
     * Optimize database query for demo
     */
    optimizeQuery(query) {
        if (!config.demo.enabled) {
            return query;
        }

        // Add lean() for better performance
        if (typeof query.lean === 'function') {
            query = query.lean();
        }

        // Limit results in demo mode
        if (typeof query.limit === 'function') {
            query = query.limit(50);
        }

        return query;
    }

    /**
     * Clear demo cache
     */
    clearCache() {
        this.demoCache.flushAll();
        this.preloadCache.clear();
        console.log('[DEMO PERF] Cache cleared');
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            demoCache: this.demoCache.getStats(),
            preloadCache: {
                size: this.preloadCache.size,
                keys: Array.from(this.preloadCache.keys())
            }
        };
    }

    /**
     * Middleware to add performance headers
     */
    performanceHeaders(req, res, next) {
        const startTime = Date.now();

        res.on('finish', () => {
            const duration = Date.now() - startTime;

            // Log slow requests
            if (duration > 300) {
                console.warn(`[DEMO PERF] Slow request: ${req.method} ${req.url} - ${duration}ms`);
            }
        });

        next();
    }

    /**
     * Batch operations for better performance
     */
    async batchFetch(ids, model, selectFields = '') {
        const cacheKey = `batch_${model.modelName}_${ids.join(',')}`;

        return await this.cacheWrapper(cacheKey, async () => {
            return await model.find({ _id: { $in: ids } })
                .select(selectFields)
                .lean();
        }, 60);
    }

    /**
     * Optimize image/media URLs for demo
     */
    optimizeMediaUrl(url) {
        if (!config.demo.enabled || !url) {
            return url;
        }

        // Add optimization parameters for faster loading
        if (url.includes('cloudinary.com')) {
            return url.replace('/upload/', '/upload/q_auto,f_auto,w_800/');
        }

        return url;
    }

    /**
     * Reduce artificial delays in demo mode
     */
    async smartDelay(normalDelayMs) {
        if (config.demo.enabled && config.demo.fastMode) {
            const reducedDelay = Math.min(normalDelayMs / 3, 100);
            await new Promise(resolve => setTimeout(resolve, reducedDelay));
        } else {
            await new Promise(resolve => setTimeout(resolve, normalDelayMs));
        }
    }
}

// Singleton instance
const demoPerformanceOptimizer = new DemoPerformanceOptimizer();

// Auto-preload on startup if demo mode enabled
if (config.demo.enabled && config.demo.preloadData) {
    // Wait for mongoose connection ready event
    const mongoose = require('mongoose');

    if (mongoose.connection.readyState === 1) {
        // Already connected
        demoPerformanceOptimizer.preloadDemoData();
    } else {
        // Wait for connection
        mongoose.connection.once('connected', () => {
            demoPerformanceOptimizer.preloadDemoData();
        });
    }
}

module.exports = demoPerformanceOptimizer;
