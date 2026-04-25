const poiDailyStatsAggregator = require('../services/poi-daily-stats-aggregator.service');
const PoiDailyStats = require('../models/poi-daily-stats.model');
const PoiHourlyStats = require('../models/poi-hourly-stats.model');
const Poi = require('../models/poi.model');
const { AppError } = require('../middlewares/error.middleware');
const { POI_STATUS } = require('../constants/poi-status');
const mongoose = require('mongoose');

/**
 * Owner Dashboard Service
 * High-performance analytics queries for owner dashboard
 *
 * CRITICAL: Only queries aggregated collections (poi_daily_stats, PoiHourlyStats)
 * NEVER queries raw event collections
 */

const MAX_TIME_MS = 5000;
const DEFAULT_DAYS = 7;
const MAX_DAYS = 90;

// In-memory cache
const cache = {
    topPois: { data: null, timestamp: 0, ttl: 60000 }, // 60 seconds
    heatmap: new Map() // poi_id -> { data, timestamp }
};

class OwnerDashboardService {
    /**
     * Verify POI ownership and status
     */
    async _verifyOwnership(poiId, ownerId) {
        if (!mongoose.Types.ObjectId.isValid(poiId)) {
            throw new AppError('Invalid POI ID', 400);
        }

        const poi = await Poi.findById(poiId)
            .select('_id code submittedBy status')
            .lean()
            .maxTimeMS(MAX_TIME_MS);

        if (!poi) {
            throw new AppError('POI not found', 404);
        }

        if (String(poi.submittedBy) !== String(ownerId)) {
            throw new AppError('Unauthorized: You do not own this POI', 403);
        }

        if (poi.status !== POI_STATUS.APPROVED) {
            throw new AppError('POI must be approved to view analytics', 409);
        }

        return poi;
    }

    /**
     * Parse and validate date range
     */
    _parseDateRange(from, to, maxDays = MAX_DAYS) {
        const now = new Date();
        const defaultFrom = new Date(now);
        defaultFrom.setUTCDate(defaultFrom.getUTCDate() - DEFAULT_DAYS);
        defaultFrom.setUTCHours(0, 0, 0, 0);

        const fromDate = from ? new Date(from) : defaultFrom;
        const toDate = to ? new Date(to) : now;

        if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
            throw new AppError('Invalid date format (use ISO 8601)', 400);
        }

        if (fromDate > toDate) {
            throw new AppError('from must be before or equal to to', 400);
        }

        const rangeDays = Math.ceil((toDate - fromDate) / (24 * 60 * 60 * 1000));
        if (rangeDays > maxDays) {
            throw new AppError(`Time range must not exceed ${maxDays} days`, 400);
        }

        return { from: fromDate, to: toDate };
    }

    /**
     * GET /analytics/poi/:code
     * Get POI overview with stats summary
     */
    async getPoiOverview(poiCode, ownerId, { from, to } = {}) {
        // Get POI by code
        const poi = await Poi.findOne({ code: poiCode.toUpperCase() })
            .select('_id code name submittedBy status')
            .lean()
            .maxTimeMS(MAX_TIME_MS);

        if (!poi) {
            throw new AppError('POI not found', 404);
        }

        // Verify ownership
        if (String(poi.submittedBy) !== String(ownerId)) {
            throw new AppError('Unauthorized: You do not own this POI', 403);
        }

        if (poi.status !== POI_STATUS.APPROVED) {
            throw new AppError('POI must be approved to view analytics', 409);
        }

        const { from: fromDate, to: toDate } = this._parseDateRange(from, to, 30);

        // Query aggregated daily stats
        const dailyStats = await PoiDailyStats.find({
            poi_id: String(poi._id),
            date: { $gte: fromDate, $lte: toDate }
        })
        .select('-_id -created_at -updated_at')
        .sort({ date: 1 })
        .lean()
        .maxTimeMS(MAX_TIME_MS);

        // Calculate summary
        const summary = this._calculateSummary(dailyStats);

        // Get trend data (last 7 days vs previous 7 days)
        const trend = await this._calculateTrend(String(poi._id), toDate);

        return {
            poi: {
                id: poi._id,
                code: poi.code,
                name: poi.name
            },
            period: {
                from: fromDate,
                to: toDate,
                days: dailyStats.length
            },
            summary,
            trend,
            daily_stats: dailyStats.map(s => ({
                date: s.date.toISOString().split('T')[0],
                visits: s.total_visits,
                unique_visitors: s.unique_visitors,
                audio_starts: s.audio_starts,
                audio_completions: s.audio_completions,
                avg_duration: s.avg_duration,
                engagement_score: s.engagement_score
            }))
        };
    }

    /**
     * Calculate summary statistics
     */
    _calculateSummary(dailyStats) {
        if (dailyStats.length === 0) {
            return {
                total_visits: 0,
                total_unique_visitors: 0,
                total_audio_plays: 0,
                avg_duration: 0,
                avg_engagement_score: 0
            };
        }

        const totalVisits = dailyStats.reduce((sum, s) => sum + s.total_visits, 0);
        const totalUniqueVisitors = dailyStats.reduce((sum, s) => sum + s.unique_visitors, 0);
        const totalAudioStarts = dailyStats.reduce((sum, s) => sum + s.audio_starts, 0);
        const totalDuration = dailyStats.reduce((sum, s) => sum + s.total_duration, 0);
        const totalEngagement = dailyStats.reduce((sum, s) => sum + s.engagement_score, 0);

        const daysWithVisits = dailyStats.filter(s => s.unique_visitors > 0).length;

        return {
            total_visits: totalVisits,
            total_unique_visitors: totalUniqueVisitors,
            total_audio_plays: totalAudioStarts,
            avg_duration: daysWithVisits > 0 ? Math.round(totalDuration / totalVisits) : 0,
            avg_engagement_score: daysWithVisits > 0 ? Math.round(totalEngagement / daysWithVisits) : 0
        };
    }

    /**
     * Calculate trend (compare last 7 days vs previous 7 days)
     */
    async _calculateTrend(poiId, toDate) {
        const last7DaysStart = new Date(toDate);
        last7DaysStart.setUTCDate(last7DaysStart.getUTCDate() - 7);
        last7DaysStart.setUTCHours(0, 0, 0, 0);

        const prev7DaysStart = new Date(last7DaysStart);
        prev7DaysStart.setUTCDate(prev7DaysStart.getUTCDate() - 7);

        const [lastPeriod, prevPeriod] = await Promise.all([
            PoiDailyStats.find({
                poi_id: poiId,
                date: { $gte: last7DaysStart, $lte: toDate }
            }).lean().maxTimeMS(MAX_TIME_MS),
            PoiDailyStats.find({
                poi_id: poiId,
                date: { $gte: prev7DaysStart, $lt: last7DaysStart }
            }).lean().maxTimeMS(MAX_TIME_MS)
        ]);

        const lastVisitors = lastPeriod.reduce((sum, s) => sum + s.unique_visitors, 0);
        const prevVisitors = prevPeriod.reduce((sum, s) => sum + s.unique_visitors, 0);

        const change = prevVisitors > 0 ? ((lastVisitors - prevVisitors) / prevVisitors) * 100 : 0;

        return {
            last_7_days: lastVisitors,
            previous_7_days: prevVisitors,
            change_percent: Math.round(change * 10) / 10
        };
    }

    /**
     * GET /analytics/top-pois
     * Get top performing POIs (admin only)
     */
    async getTopPois(userId, { metric = 'visitors', limit = 10, from, to } = {}) {
        // Check cache
        const cacheKey = `${metric}_${limit}_${from}_${to}`;
        const now = Date.now();
        if (cache.topPois.data && cache.topPois.timestamp > now - cache.topPois.ttl) {
            const cached = cache.topPois.data[cacheKey];
            if (cached) {
                return cached;
            }
        }

        const { from: fromDate, to: toDate } = this._parseDateRange(from, to, 30);

        // Aggregate by POI
        const sortField = metric === 'engagement' ? 'engagement_score' : 'unique_visitors';

        const pipeline = [
            {
                $match: {
                    date: { $gte: fromDate, $lte: toDate }
                }
            },
            {
                $group: {
                    _id: '$poi_id',
                    total_visits: { $sum: '$total_visits' },
                    total_unique_visitors: { $sum: '$unique_visitors' },
                    total_audio_plays: { $sum: '$audio_starts' },
                    avg_engagement_score: { $avg: '$engagement_score' }
                }
            },
            {
                $sort: { [sortField === 'engagement_score' ? 'avg_engagement_score' : 'total_unique_visitors']: -1 }
            },
            {
                $limit: parseInt(limit, 10)
            }
        ];

        const results = await PoiDailyStats.aggregate(pipeline)
            .option({ maxTimeMS: MAX_TIME_MS });

        // Enrich with POI details
        const poiIds = results.map(r => r._id);
        const pois = await Poi.find({ _id: { $in: poiIds } })
            .select('_id code name')
            .lean()
            .maxTimeMS(MAX_TIME_MS);

        const poiMap = new Map(pois.map(p => [String(p._id), p]));

        const enriched = results.map(r => {
            const poi = poiMap.get(r._id);
            return {
                poi: poi ? { id: poi._id, code: poi.code, name: poi.name } : null,
                total_visits: r.total_visits,
                total_unique_visitors: r.total_unique_visitors,
                total_audio_plays: r.total_audio_plays,
                avg_engagement_score: Math.round(r.avg_engagement_score)
            };
        }).filter(r => r.poi !== null);

        // Cache result
        if (!cache.topPois.data) cache.topPois.data = {};
        cache.topPois.data[cacheKey] = enriched;
        cache.topPois.timestamp = now;

        return enriched;
    }

    /**
     * GET /analytics/trends
     * Get time series data for trends
     */
    async getTrends(poiId, ownerId, { from, to, granularity = 'daily' } = {}) {
        await this._verifyOwnership(poiId, ownerId);

        const { from: fromDate, to: toDate } = this._parseDateRange(from, to, 90);

        if (granularity === 'daily') {
            // Query daily stats directly
            const stats = await PoiDailyStats.find({
                poi_id: String(poiId),
                date: { $gte: fromDate, $lte: toDate }
            })
            .select('date unique_visitors audio_starts engagement_score')
            .sort({ date: 1 })
            .lean()
            .maxTimeMS(MAX_TIME_MS);

            return stats.map(s => ({
                date: s.date.toISOString().split('T')[0],
                visitors: s.unique_visitors,
                audio_plays: s.audio_starts,
                engagement: s.engagement_score
            }));
        } else if (granularity === 'hourly') {
            // Query hourly stats
            const stats = await PoiHourlyStats.find({
                poi_id: String(poiId),
                hour_bucket: { $gte: fromDate, $lte: toDate }
            })
            .select('hour_bucket unique_devices')
            .sort({ hour_bucket: 1 })
            .lean()
            .maxTimeMS(MAX_TIME_MS);

            return stats.map(s => ({
                hour: s.hour_bucket.toISOString(),
                visitors: s.unique_devices?.length || 0
            }));
        }

        throw new AppError('Invalid granularity (use daily or hourly)', 400);
    }

    /**
     * GET /analytics/heatmap
     * Get heatmap data (hourly activity for last 7 days)
     */
    async getHeatmap(poiId, ownerId, { from, to } = {}) {
        await this._verifyOwnership(poiId, ownerId);

        // Check cache
        const cacheKey = String(poiId);
        const now = Date.now();
        const cached = cache.heatmap.get(cacheKey);
        if (cached && cached.timestamp > now - 60000) { // 60s TTL
            return cached.data;
        }

        const { from: fromDate, to: toDate } = this._parseDateRange(from, to, 7);

        // Query hourly stats
        const stats = await PoiHourlyStats.find({
            poi_id: String(poiId),
            hour_bucket: { $gte: fromDate, $lte: toDate }
        })
        .select('hour_bucket unique_devices')
        .sort({ hour_bucket: 1 })
        .lean()
        .maxTimeMS(MAX_TIME_MS);

        // Build heatmap grid (7 days x 24 hours)
        const grid = [];
        const currentDate = new Date(fromDate);

        while (currentDate <= toDate) {
            const dayData = {
                date: currentDate.toISOString().split('T')[0],
                hours: []
            };

            for (let hour = 0; hour < 24; hour++) {
                const hourBucket = new Date(currentDate);
                hourBucket.setUTCHours(hour, 0, 0, 0);

                const stat = stats.find(s =>
                    s.hour_bucket.getTime() === hourBucket.getTime()
                );

                dayData.hours.push({
                    hour,
                    visitors: stat ? (stat.unique_devices?.length || 0) : 0
                });
            }

            grid.push(dayData);
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        }

        // Cache result
        cache.heatmap.set(cacheKey, { data: grid, timestamp: now });

        return grid;
    }

    /**
     * Clear cache (for testing or manual refresh)
     */
    clearCache() {
        cache.topPois = { data: null, timestamp: 0, ttl: 60000 };
        cache.heatmap.clear();
    }
}

module.exports = new OwnerDashboardService();
