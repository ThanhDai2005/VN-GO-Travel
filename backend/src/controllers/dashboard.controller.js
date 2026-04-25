const User = require('../models/user.model');
const Poi = require('../models/poi.model');
const Zone = require('../models/zone.model');
const CreditTransaction = require('../models/credit-transaction.model');
const UserUnlockPoi = require('../models/user-unlock-poi.model');
const UserUnlockZone = require('../models/user-unlock-zone.model');
const demoPerformanceOptimizer = require('../utils/demo-performance');

/**
 * DEMO DASHBOARD CONTROLLER
 * Optimized for storytelling and impressive metrics
 */

exports.getDemoStats = async (req, res, next) => {
    try {
        // Use aggressive caching for demo
        const stats = await demoPerformanceOptimizer.cacheWrapper(
            'dashboard_stats',
            async () => {
                const [
                    totalUsers,
                    activeUsers,
                    premiumUsers,
                    totalPois,
                    approvedPois,
                    totalZones,
                    totalScans,
                    totalRevenue
                ] = await Promise.all([
                    User.countDocuments(),
                    User.countDocuments({ isActive: true }),
                    User.countDocuments({ isPremium: true }),
                    Poi.countDocuments(),
                    Poi.countDocuments({ status: 'APPROVED' }),
                    Zone.countDocuments(),
                    CreditTransaction.countDocuments({ type: 'POI_SCAN' }),
                    CreditTransaction.aggregate([
                        { $match: { type: 'DEBIT' } },
                        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } }
                    ])
                ]);

                return {
                    users: {
                        total: totalUsers,
                        active: activeUsers,
                        premium: premiumUsers,
                        growth: '+12%' // Demo metric
                    },
                    content: {
                        pois: totalPois,
                        approved: approvedPois,
                        zones: totalZones,
                        coverage: '95%' // Demo metric
                    },
                    engagement: {
                        totalScans: totalScans,
                        avgScansPerUser: totalUsers > 0 ? Math.round(totalScans / totalUsers) : 0,
                        activeToday: Math.round(activeUsers * 0.3) // Demo metric
                    },
                    revenue: {
                        total: totalRevenue[0]?.total || 0,
                        thisMonth: Math.round((totalRevenue[0]?.total || 0) * 0.4), // Demo metric
                        growth: '+18%' // Demo metric
                    }
                };
            },
            60 // Cache for 1 minute
        );

        res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error) {
        next(error);
    }
};

exports.getAnalytics = async (req, res, next) => {
    try {
        const analytics = await demoPerformanceOptimizer.cacheWrapper(
            'dashboard_analytics',
            async () => {
                // Most visited POIs
                const topPois = await CreditTransaction.aggregate([
                    { $match: { type: 'POI_SCAN', 'metadata.poiCode': { $exists: true } } },
                    { $group: { _id: '$metadata.poiCode', count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                    { $limit: 5 }
                ]);

                // Enrich with POI details
                const topPoisWithDetails = await Promise.all(
                    topPois.map(async (item) => {
                        const poi = await Poi.findOne({ code: item._id }).select('name code').lean();
                        return {
                            code: item._id,
                            name: poi?.name || 'Unknown',
                            visits: item.count
                        };
                    })
                );

                // Most active zones
                const topZones = await UserUnlockZone.aggregate([
                    { $group: { _id: '$zoneCode', purchases: { $sum: 1 } } },
                    { $sort: { purchases: -1 } },
                    { $limit: 5 }
                ]);

                // Enrich with zone details
                const topZonesWithDetails = await Promise.all(
                    topZones.map(async (item) => {
                        const zone = await Zone.findOne({ code: item._id }).select('name code').lean();
                        return {
                            code: item._id,
                            name: zone?.name || 'Unknown',
                            purchases: item.purchases
                        };
                    })
                );

                // User activity timeline (last 7 days)
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

                const dailyActivity = await CreditTransaction.aggregate([
                    { $match: { createdAt: { $gte: sevenDaysAgo } } },
                    {
                        $group: {
                            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                            scans: { $sum: 1 }
                        }
                    },
                    { $sort: { _id: 1 } }
                ]);

                return {
                    topPois: topPoisWithDetails,
                    topZones: topZonesWithDetails,
                    dailyActivity: dailyActivity.map(d => ({
                        date: d._id,
                        scans: d.scans
                    })),
                    insights: {
                        peakHour: '14:00 - 15:00', // Demo metric
                        avgSessionDuration: '8.5 min', // Demo metric
                        returnRate: '68%' // Demo metric
                    }
                };
            },
            60
        );

        res.status(200).json({
            success: true,
            data: analytics
        });
    } catch (error) {
        next(error);
    }
};

exports.getRecentActivity = async (req, res, next) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);

        const recentActivity = await demoPerformanceOptimizer.cacheWrapper(
            `recent_activity_${limit}`,
            async () => {
                const activities = await CreditTransaction.find()
                    .sort({ createdAt: -1 })
                    .limit(limit)
                    .populate('userId', 'email fullName')
                    .lean();

                return activities.map(activity => ({
                    id: activity._id,
                    type: activity.type,
                    description: activity.description,
                    amount: activity.amount,
                    user: {
                        email: activity.userId?.email || 'Unknown',
                        name: activity.userId?.fullName || 'Unknown User'
                    },
                    timestamp: activity.createdAt,
                    metadata: activity.metadata
                }));
            },
            30 // Cache for 30 seconds
        );

        res.status(200).json({
            success: true,
            count: recentActivity.length,
            data: recentActivity
        });
    } catch (error) {
        next(error);
    }
};
