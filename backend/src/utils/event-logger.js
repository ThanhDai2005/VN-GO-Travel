/**
 * Event Logger Utility
 * Logs important system events for analytics and auditing
 */

const Event = require('../models/event.model');

const EVENT_TYPES = {
    ZONE_SCAN: 'ZONE_SCAN',
    ZONE_DOWNLOAD: 'ZONE_DOWNLOAD',
    QR_TOKEN_GENERATED: 'QR_TOKEN_GENERATED',
    QR_TOKEN_REVOKED: 'QR_TOKEN_REVOKED',
    ZONE_PURCHASED: 'ZONE_PURCHASED',
    ACCESS_DENIED: 'ACCESS_DENIED'
};

/**
 * Log an event to database
 * @param {string} eventType - Type of event (from EVENT_TYPES)
 * @param {object} data - Event data
 */
async function logEvent(eventType, data) {
    try {
        const logEntry = {
            eventType,
            ...data
        };

        // Log to console in development
        if (process.env.NODE_ENV !== 'production') {
            console.log('[EVENT]', JSON.stringify(logEntry));
        }

        // Persist to database
        const event = await Event.create(logEntry);

        // Verify it was saved
        if (!event || !event._id) {
            console.error('[EVENT-LOGGER] Event created but no _id returned');
        }
    } catch (error) {
        // Never throw from logger - log errors but don't break the request
        console.error('[EVENT-LOGGER] Failed to log event:', error.message);
        console.error('[EVENT-LOGGER] Event data:', JSON.stringify({ eventType, ...data }));
    }
}

/**
 * Query events from database
 * @param {object} filters - Query filters
 * @param {object} options - Query options (limit, skip, sort)
 */
async function queryEvents(filters = {}, options = {}) {
    try {
        const {
            limit = 100,
            skip = 0,
            sort = { createdAt: -1 }
        } = options;

        const events = await Event.find(filters)
            .limit(limit)
            .skip(skip)
            .sort(sort)
            .lean();

        const total = await Event.countDocuments(filters);

        return {
            events,
            total,
            limit,
            skip
        };
    } catch (error) {
        console.error('[EVENT-LOGGER] Failed to query events:', error);
        throw error;
    }
}

/**
 * Get event statistics
 * @param {object} filters - Query filters
 */
async function getEventStats(filters = {}) {
    try {
        const stats = await Event.aggregate([
            { $match: filters },
            {
                $group: {
                    _id: '$eventType',
                    count: { $sum: 1 },
                    successCount: {
                        $sum: { $cond: ['$success', 1, 0] }
                    },
                    failureCount: {
                        $sum: { $cond: ['$success', 0, 1] }
                    },
                    avgResponseTime: { $avg: '$responseTime' }
                }
            }
        ]);

        return stats;
    } catch (error) {
        console.error('[EVENT-LOGGER] Failed to get event stats:', error);
        throw error;
    }
}

module.exports = {
    logEvent,
    queryEvents,
    getEventStats,
    EVENT_TYPES
};
