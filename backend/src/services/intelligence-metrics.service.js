/**
 * User Intelligence metrics (7.3.2) — rollup collections ONLY.
 * Never reads uis_events_raw.
 */

const { AppError } = require('../middlewares/error.middleware');
const IntelligenceAnalyticsRollupHourly = require('../models/intelligence-analytics-rollup-hourly.model');
const IntelligenceAnalyticsRollupDaily = require('../models/intelligence-analytics-rollup-daily.model');
const IntelligenceEventRaw = require('../models/intelligence-event-raw.model');
const PoiHourlyStats = require('../models/poi-hourly-stats.model');
const Poi = require('../models/poi.model');
const User = require('../models/user.model');
const DeviceSession = require('../models/device-session.model');
const { POI_STATUS } = require('../constants/poi-status');

/** Metrics API: max window between start and end (inclusive span). */
const MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_TIME_MS = 2000;

// ⚙️ IMPLEMENTATION PART 3 — CONFIGURABLE THRESHOLDS
const LOW_THRESHOLD = 10;
const HIGH_THRESHOLD = 30;

/**
 * ⚙️ IMPLEMENTATION PART 1 — SIMPLE PREDICTION MODEL
 * Simple moving average using last 3 values.
 * @param {number[]} values 
 */
function predictNext(values) {
    if (!Array.isArray(values) || values.length === 0) return 0;
    if (values.length < 3) return values[values.length - 1];

    const last3 = values.slice(-3);
    return last3.reduce((a, b) => a + b, 0) / 3;
}

/**
 * ⚙️ IMPLEMENTATION PART 3 — CLASSIFICATION
 * @param {number} value 
 */
function classifyTraffic(value) {
    if (value < LOW_THRESHOLD) return 'LOW';
    if (value < HIGH_THRESHOLD) return 'MEDIUM';
    return 'HIGH';
}

function parseIsoRange(startStr, endStr) {
    if (!startStr || !endStr) {
        throw new AppError('Query params start and end are required (ISO 8601)', 400);
    }
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new AppError('start and end must be valid ISO 8601 dates', 400);
    }
    if (start > end) {
        throw new AppError('start must be before or equal to end', 400);
    }
    if (end.getTime() - start.getTime() > MAX_RANGE_MS) {
        throw new AppError('Time range must not exceed 90 days', 400);
    }
    return { start, end };
}

function resolveGranularity(value) {
    if (value == null || value === '' || value === 'daily') {
        return 'daily';
    }
    if (value === 'hourly') {
        return 'hourly';
    }
    throw new AppError('granularity must be hourly or daily', 400);
}

function rollupModel(granularity) {
    return granularity === 'hourly'
        ? IntelligenceAnalyticsRollupHourly
        : IntelligenceAnalyticsRollupDaily;
}

function matchStage(start, end) {
    return {
        $match: {
            bucket_start: { $gte: start, $lte: end }
        }
    };
}

/**
 * @param {{ start: string, end: string, granularity?: string }} params
 * @returns {Promise<Array<{ event_family: string, total_events: number }>>}
 */
async function getEventsByFamily(params) {
    const { start, end } = parseIsoRange(params.start, params.end);
    const granularity = resolveGranularity(params.granularity);
    const Model = rollupModel(granularity);

    const pipeline = [
        matchStage(start, end),
        {
            $group: {
                _id: '$event_family',
                total_events: { $sum: '$total_events' }
            }
        },
        { $sort: { _id: 1 } },
        {
            $project: {
                _id: 0,
                event_family: '$_id',
                total_events: 1
            }
        }
    ];

    return Model.aggregate(pipeline).option({ maxTimeMS: MAX_TIME_MS });
}

/**
 * @param {{ start: string, end: string, granularity?: string }} params
 * @returns {Promise<Array<{ auth_state: string, total_events: number }>>}
 */
async function getEventsByAuthState(params) {
    const { start, end } = parseIsoRange(params.start, params.end);
    const granularity = resolveGranularity(params.granularity);
    const Model = rollupModel(granularity);

    const pipeline = [
        matchStage(start, end),
        {
            $group: {
                _id: '$auth_state',
                total_events: { $sum: '$total_events' }
            }
        },
        { $sort: { _id: 1 } },
        {
            $project: {
                _id: 0,
                auth_state: '$_id',
                total_events: 1
            }
        }
    ];

    return Model.aggregate(pipeline).option({ maxTimeMS: MAX_TIME_MS });
}

/**
 * @param {{ start: string, end: string, granularity?: string }} params
 * @returns {Promise<Array<{ bucket_start: Date, total_events: number }>>}
 */
async function getTimeline(params) {
    const { start, end } = parseIsoRange(params.start, params.end);
    const granularity = resolveGranularity(params.granularity);
    const Model = rollupModel(granularity);

    const pipeline = [
        matchStage(start, end),
        {
            $group: {
                _id: '$bucket_start',
                total_events: { $sum: '$total_events' }
            }
        },
        { $sort: { _id: 1 } },
        {
            $project: {
                _id: 0,
                bucket_start: '$_id',
                total_events: 1
            }
        }
    ];

    return Model.aggregate(pipeline).option({ maxTimeMS: MAX_TIME_MS });
}

/**
 * @param {{ start: string, end: string }} params
 */
async function getRevenueAnalytics(params) {
    const { start, end } = parseIsoRange(params.start, params.end);
    const UserUnlockZone = require('../models/user-unlock-zone.model');
    const Zone = require('../models/zone.model');

    // 1. Transactions matching range
    const transactions = await UserUnlockZone.find({
        purchasedAt: { $gte: start, $lte: end }
    })
    .populate('userId', 'email fullName')
    .sort({ purchasedAt: -1 })
    .lean();

    // 2. Aggregate stats
    const totalRevenue = transactions.reduce((sum, t) => sum + (t.purchasePrice || 0), 0);
    const totalPurchases = transactions.length;
    
    // 3. Top Zones
    const zoneCounts = {};
    const zoneRevenue = {};
    transactions.forEach(t => {
        zoneCounts[t.zoneCode] = (zoneCounts[t.zoneCode] || 0) + 1;
        zoneRevenue[t.zoneCode] = (zoneRevenue[t.zoneCode] || 0) + (t.purchasePrice || 0);
    });
    
    const topZones = Object.entries(zoneCounts)
        .map(([code, count]) => ({ code, count, revenue: zoneRevenue[code] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
        
    const enrichedTopZones = await Promise.all(topZones.map(async (item) => {
        const zone = await Zone.findOne({ code: item.code }).select('name').lean();
        return {
            name: zone?.name || item.code,
            count: item.count,
            revenue: item.revenue
        };
    }));

    // 4. Timeline
    const dailyStats = await UserUnlockZone.aggregate([
        { $match: { purchasedAt: { $gte: start, $lte: end } } },
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$purchasedAt' } },
                revenue: { $sum: '$purchasePrice' },
                count: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    return {
        summary: {
            totalRevenue,
            totalPurchases,
            uniqueZonesSold: Object.keys(zoneCounts).length,
            bestSeller: enrichedTopZones[0]?.name || 'N/A'
        },
        topZones: enrichedTopZones,
        timeline: dailyStats.map(d => ({
            date: d._id,
            revenue: d.revenue,
            count: d.count
        })),
        transactions: transactions.map(t => ({
            id: t._id,
            userName: t.userId?.fullName || 'Unknown',
            userEmail: t.userId?.email || 'Unknown',
            zoneCode: t.zoneCode,
            amount: t.purchasePrice,
            purchasedAt: t.purchasedAt,
            source: t.source || 'MAP',
            serverVerified: t.serverVerified ?? true
        }))
    };
}

module.exports = {
    getEventsByFamily,
    getEventsByAuthState,
    getTimeline,
    /**
     * Aggregate geo heatmap points from raw events by POI.
     * Returns only approved/public POIs with valid coordinates.
     *
     * @param {{ start: string, end: string }} params
     * @returns {Promise<Array<{ poi_id: string, code: string, name: string, lat: number, lng: number, total_events: number }>>}
     */
    async getGeoHeatmap(params) {
        const { start, end } = parseIsoRange(params.start, params.end);

        // ⚙️ IMPLEMENTATION PART 2 — DATA PREPARATION (from PoiHourlyStats)
        // Step 1: Aggregate range totals from PoiHourlyStats instead of raw events for efficiency
        const statsAggregation = await PoiHourlyStats.aggregate([
            {
                $match: {
                    hour_bucket: { $gte: start, $lte: end }
                }
            },
            {
                $group: {
                    _id: '$poi_id',
                    total_visitors: { $sum: { $size: { $ifNull: ["$unique_devices", []] } } }
                }
            }
        ]).option({ maxTimeMS: MAX_TIME_MS });

        const visitorsByPoi = new Map(statsAggregation.map(s => [String(s._id), s.total_visitors]));

        // Step 2: Fetch recent history for prediction (last 3-4 hours)
        const predictionWindowStart = new Date(Date.now() - 6 * 3600000);
        const historyStats = await PoiHourlyStats.aggregate([
            { $match: { hour_bucket: { $gte: predictionWindowStart } } },
            { $sort: { hour_bucket: 1 } },
            {
                $project: {
                    poi_id: 1,
                    hour_bucket: 1,
                    total_visitors: { $size: { $ifNull: ["$unique_devices", []] } }
                }
            }
        ]).option({ maxTimeMS: MAX_TIME_MS });

        const historyByPoi = new Map();
        for (const s of historyStats) {
            const pid = String(s.poi_id);
            if (!historyByPoi.has(pid)) historyByPoi.set(pid, []);
            historyByPoi.get(pid).push(s.total_visitors);
        }

        // Step 3: Fetch POI details
        const pois = await Poi.find({
            $or: [
                { status: POI_STATUS.APPROVED },
                { status: { $exists: false } }
            ]
        }).select('_id code name location').lean();

        // ⚙️ IMPLEMENTATION PART 4 — API RESPONSE EXTENSION
        return pois
            .map((poi) => {
                const poiId = String(poi._id);
                if (!poi.location || !Array.isArray(poi.location.coordinates)) return null;

                const lng = Number(poi.location.coordinates[0]);
                const lat = Number(poi.location.coordinates[1]);
                if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

                const current = visitorsByPoi.get(poiId) || 0;
                const history = historyByPoi.get(poiId) || [0];
                const predicted = Math.round(predictNext(history));
                const level = classifyTraffic(predicted);

                return {
                    poi_id: poiId,
                    code: String(poi.code || ''),
                    name: String(poi.name || ''),
                    lat,
                    lng,
                    total_events: current, // Keep for backward compatibility with heatmap intensity
                    current,
                    predicted,
                    level
                };
            })
            .filter(Boolean);
    },

    /**
     * @param {string} userId
     * @param {{ start: string, end: string, granularity?: string }} params
     */
    async getOwnerTimeline(userId, params) {
        const { start, end } = parseIsoRange(params.start, params.end);
        const granularity = params.granularity || 'daily';
        
        // Find owner POIs
        const ownerPois = await Poi.find({ submittedBy: userId, status: POI_STATUS.APPROVED }).select('_id').lean();
        if (ownerPois.length === 0) return [];
        const poiIds = ownerPois.map(p => String(p._id));

        const Model = rollupModel(granularity === 'hourly' ? 'hourly' : 'daily');
        
        const dateGrouping = {
            hourly: { $dateTrunc: { date: "$bucket_start", unit: "hour" } },
            daily: { $dateTrunc: { date: "$bucket_start", unit: "day" } },
            weekly: { $dateTrunc: { date: "$bucket_start", unit: "week" } },
            monthly: { $dateTrunc: { date: "$bucket_start", unit: "month" } },
            yearly: { $dateTrunc: { date: "$bucket_start", unit: "year" } }
        }[granularity] || { $dateTrunc: { date: "$bucket_start", unit: "day" } };

        const pipeline = [
            {
                $match: {
                    bucket_start: { $gte: start, $lte: end },
                    poi_id: { $in: poiIds }
                }
            },
            {
                $group: {
                    _id: dateGrouping,
                    total_events: { $sum: '$total_events' }
                }
            },
            { $sort: { _id: 1 } },
            {
                $project: {
                    _id: 0,
                    bucket_start: '$_id',
                    total_events: 1
                }
            }
        ];

        return Model.aggregate(pipeline).option({ maxTimeMS: MAX_TIME_MS });
    },

    /**
     * @param {string} userId
     * @param {{ start: string, end: string }} params
     */
    async getOwnerEventsByFamily(userId, params) {
        const { start, end } = parseIsoRange(params.start, params.end);
        const ownerPois = await Poi.find({ submittedBy: userId, status: POI_STATUS.APPROVED }).select('_id').lean();
        if (ownerPois.length === 0) return [];
        const poiIds = ownerPois.map(p => String(p._id));

        const pipeline = [
            {
                $match: {
                    bucket_start: { $gte: start, $lte: end },
                    poi_id: { $in: poiIds }
                }
            },
            {
                $group: {
                    _id: '$event_family',
                    total_events: { $sum: '$total_events' }
                }
            },
            {
                $project: {
                    _id: 0,
                    event_family: '$_id',
                    total_events: 1
                }
            }
        ];

        return IntelligenceAnalyticsRollupDaily.aggregate(pipeline).option({ maxTimeMS: MAX_TIME_MS });
    },

    /**
     * @param {{ start: string, end: string }} params
     * @returns {Promise<{ totalUsers: number, newPremiumUsers: number, estimatedRevenue: number }>}
     */
    async getOverview(params) {
        const { start, end } = parseIsoRange(params.start, params.end);

        const [totalUsers, newPremiumUsers] = await Promise.all([
            // Total users created up to 'end' (cumulative)
            User.countDocuments({ createdAt: { $lte: end } }),

            // New premium users within range using premiumActivatedAt
            User.countDocuments({
                isPremium: true,
                premiumActivatedAt: { $gte: start, $lte: end }
            })
        ]);

        // Estimated revenue: $20 per new premium user
        const estimatedRevenue = newPremiumUsers * 20;

        return {
            totalUsers,
            newPremiumUsers,
            estimatedRevenue
        };
    },

    /**
     * System overview - lifetime stats (unaffected by time filter)
     * @returns {Promise<{ totalUsers: number, totalPremiumUsers: number }>}
     */
    async getSystemOverview() {
        const ONLINE_GRACE_MS = 10 * 1000; // 10 seconds grace for online status
        const threshold = new Date(Date.now() - ONLINE_GRACE_MS);

        const [totalUsers, totalPremiumUsers, onlineUsers] = await Promise.all([
            User.countDocuments({}),
            User.countDocuments({ isPremium: true }),
            DeviceSession.countDocuments({
                isOnline: true,
                lastSeenAt: { $gte: threshold }
            })
        ]);

        return {
            totalUsers,
            totalPremiumUsers,
            onlineUsers
        };
    },
    getRevenueAnalytics,
    MAX_RANGE_MS,
    MAX_TIME_MS
};
