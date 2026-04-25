const mongoose = require('mongoose');
const Poi = require('../models/poi.model');
const PoiHourlyStats = require('../models/poi-hourly-stats.model');
const IntelligenceEventRaw = require('../models/intelligence-event-raw.model');
const { AppError } = require('../middlewares/error.middleware');
const { POI_STATUS } = require('../constants/poi-status');

const MAX_RANGE_DAYS = 7;
const MAX_TIME_MS = 5000;

/**
 * Intelligence Owner Metrics Service
 * Provides analytics for POI owners
 */
class IntelligenceOwnerMetricsService {
    /**
     * Verify POI ownership
     */
    async _verifyOwnership(poiId, ownerId) {
        if (!mongoose.Types.ObjectId.isValid(poiId)) {
            throw new AppError('Invalid POI ID', 400);
        }

        const poi = await Poi.findById(poiId).select('submittedBy status').lean();

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
     * Parse and validate time range
     */
    _parseTimeRange(from, to) {
        const now = new Date();
        const defaultFrom = new Date(now.getTime() - MAX_RANGE_DAYS * 24 * 60 * 60 * 1000);

        const fromDate = from ? new Date(from) : defaultFrom;
        const toDate = to ? new Date(to) : now;

        if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
            throw new AppError('Invalid date format (use ISO 8601)', 400);
        }

        if (fromDate > toDate) {
            throw new AppError('from must be before or equal to to', 400);
        }

        const rangeMs = toDate.getTime() - fromDate.getTime();
        const maxRangeMs = MAX_RANGE_DAYS * 24 * 60 * 60 * 1000;

        if (rangeMs > maxRangeMs) {
            throw new AppError(`Time range must not exceed ${MAX_RANGE_DAYS} days`, 400);
        }

        return { from: fromDate, to: toDate };
    }

    /**
     * Get POI visit statistics
     */
    async getPoiVisits(poiId, ownerId, from, to) {
        await this._verifyOwnership(poiId, ownerId);
        const { from: fromDate, to: toDate } = this._parseTimeRange(from, to);

        const stats = await PoiHourlyStats.find({
            poi_id: String(poiId),
            hour_bucket: { $gte: fromDate, $lte: toDate }
        })
        .select('hour_bucket unique_devices')
        .sort({ hour_bucket: 1 })
        .lean()
        .maxTimeMS(MAX_TIME_MS);

        return stats.map(s => ({
            hour: s.hour_bucket,
            unique_visitors: s.unique_devices ? s.unique_devices.length : 0
        }));
    }

    /**
     * Get audio playback statistics
     */
    async getAudioStats(poiId, ownerId, from, to) {
        await this._verifyOwnership(poiId, ownerId);
        const { from: fromDate, to: toDate } = this._parseTimeRange(from, to);

        const audioEvents = await IntelligenceEventRaw.find({
            event_family: 'UserInteractionEvent',
            'payload.poi_id': String(poiId),
            'payload.interaction_type': { $in: ['audio_start', 'audio_completed', 'audio_cancelled'] },
            timestamp: { $gte: fromDate, $lte: toDate }
        })
        .select('payload.interaction_type payload.audio_type')
        .lean()
        .maxTimeMS(MAX_TIME_MS);

        const starts = audioEvents.filter(e => e.payload.interaction_type === 'audio_start').length;
        const completions = audioEvents.filter(e => e.payload.interaction_type === 'audio_completed').length;
        const cancellations = audioEvents.filter(e => e.payload.interaction_type === 'audio_cancelled').length;

        const shortAudio = audioEvents.filter(e => e.payload.audio_type === 'short').length;
        const longAudio = audioEvents.filter(e => e.payload.audio_type === 'long').length;

        return {
            total_starts: starts,
            total_completions: completions,
            total_cancellations: cancellations,
            completion_rate: starts > 0 ? parseFloat(((completions / starts) * 100).toFixed(2)) : 0,
            short_audio_plays: shortAudio,
            long_audio_plays: longAudio
        };
    }

    /**
     * Get visit duration statistics
     */
    async getVisitDuration(poiId, ownerId, from, to) {
        await this._verifyOwnership(poiId, ownerId);
        const { from: fromDate, to: toDate } = this._parseTimeRange(from, to);

        const exitEvents = await IntelligenceEventRaw.find({
            event_family: 'LocationEvent',
            'payload.poi_id': String(poiId),
            'payload.session_event': 'exit',
            'payload.duration_seconds': { $exists: true },
            timestamp: { $gte: fromDate, $lte: toDate }
        })
        .select('payload.duration_seconds')
        .lean()
        .maxTimeMS(MAX_TIME_MS);

        if (exitEvents.length === 0) {
            return {
                average_duration: 0,
                total_visits: 0,
                min_duration: 0,
                max_duration: 0
            };
        }

        const durations = exitEvents.map(e => e.payload.duration_seconds);
        const totalDuration = durations.reduce((sum, d) => sum + d, 0);
        const avgDuration = totalDuration / durations.length;

        return {
            average_duration: Math.round(avgDuration),
            total_visits: exitEvents.length,
            min_duration: Math.min(...durations),
            max_duration: Math.max(...durations)
        };
    }

    /**
     * Get comprehensive POI analytics summary
     */
    async getPoiSummary(poiId, ownerId, from, to) {
        await this._verifyOwnership(poiId, ownerId);

        const [visits, audioStats, visitDuration] = await Promise.all([
            this.getPoiVisits(poiId, ownerId, from, to),
            this.getAudioStats(poiId, ownerId, from, to),
            this.getVisitDuration(poiId, ownerId, from, to)
        ]);

        const totalVisitors = visits.reduce((sum, v) => sum + v.unique_visitors, 0);

        return {
            poi_id: poiId,
            time_range: {
                from: this._parseTimeRange(from, to).from,
                to: this._parseTimeRange(from, to).to
            },
            visits: {
                total_unique_visitors: totalVisitors,
                hourly_breakdown: visits
            },
            audio: audioStats,
            visit_duration: visitDuration
        };
    }
}

module.exports = new IntelligenceOwnerMetricsService();
