const mongoose = require('mongoose');
const PoiDailyStats = require('../models/poi-daily-stats.model');
const PoiHourlyStats = require('../models/poi-hourly-stats.model');
const IntelligenceEventRaw = require('../models/intelligence-event-raw.model');

/**
 * POI Daily Stats Aggregator Service
 * Aggregates hourly stats into daily summaries
 * Runs as a scheduled job (daily at midnight UTC)
 */
class PoiDailyStatsAggregatorService {
    /**
     * Aggregate stats for a specific date
     * @param {Date} date - The date to aggregate (UTC)
     */
    async aggregateDate(date) {
        const startOfDay = new Date(date);
        startOfDay.setUTCHours(0, 0, 0, 0);

        const endOfDay = new Date(date);
        endOfDay.setUTCHours(23, 59, 59, 999);

        console.log(`[POI-DAILY-AGGREGATOR] Aggregating ${startOfDay.toISOString().split('T')[0]}`);

        // Get all POIs that had activity on this date
        const activePois = await PoiHourlyStats.distinct('poi_id', {
            hour_bucket: { $gte: startOfDay, $lte: endOfDay }
        });

        console.log(`[POI-DAILY-AGGREGATOR] Found ${activePois.length} active POIs`);

        const results = [];

        for (const poiId of activePois) {
            try {
                const stats = await this.aggregatePoiDate(poiId, startOfDay, endOfDay);
                results.push(stats);
            } catch (error) {
                console.error(`[POI-DAILY-AGGREGATOR] Error aggregating POI ${poiId}:`, error.message);
            }
        }

        console.log(`[POI-DAILY-AGGREGATOR] Aggregated ${results.length} POI stats`);
        return results;
    }

    /**
     * Aggregate stats for a specific POI on a specific date
     */
    async aggregatePoiDate(poiId, startOfDay, endOfDay) {
        // Get hourly stats for this POI on this date
        const hourlyStats = await PoiHourlyStats.find({
            poi_id: String(poiId),
            hour_bucket: { $gte: startOfDay, $lte: endOfDay }
        }).lean();

        // Aggregate unique visitors
        const allDevices = new Set();
        hourlyStats.forEach(stat => {
            if (stat.unique_devices) {
                stat.unique_devices.forEach(device => allDevices.add(device));
            }
        });

        const uniqueVisitors = allDevices.size;
        const totalVisits = hourlyStats.reduce((sum, stat) => sum + (stat.unique_devices?.length || 0), 0);

        // Get audio stats from raw events
        const audioStats = await this.getAudioStats(poiId, startOfDay, endOfDay);

        // Get duration stats from raw events
        const durationStats = await this.getDurationStats(poiId, startOfDay, endOfDay);

        // Calculate engagement score
        const engagementScore = this.calculateEngagementScore({
            uniqueVisitors,
            audioCompletions: audioStats.audio_completions,
            audioStarts: audioStats.audio_starts,
            avgDuration: durationStats.avg_duration
        });

        // Upsert daily stats
        const dailyStats = await PoiDailyStats.findOneAndUpdate(
            {
                poi_id: String(poiId),
                date: startOfDay
            },
            {
                $set: {
                    total_visits: totalVisits,
                    unique_visitors: uniqueVisitors,
                    audio_starts: audioStats.audio_starts,
                    audio_completions: audioStats.audio_completions,
                    audio_cancellations: audioStats.audio_cancellations,
                    total_duration: durationStats.total_duration,
                    avg_duration: durationStats.avg_duration,
                    min_duration: durationStats.min_duration,
                    max_duration: durationStats.max_duration,
                    engagement_score: engagementScore,
                    updated_at: new Date()
                }
            },
            {
                upsert: true,
                returnDocument: 'after'
            }
        );

        return dailyStats;
    }

    /**
     * Get audio statistics from raw events
     */
    async getAudioStats(poiId, startOfDay, endOfDay) {
        const audioEvents = await IntelligenceEventRaw.find({
            event_family: 'UserInteractionEvent',
            'payload.poi_id': String(poiId),
            'payload.interaction_type': { $in: ['audio_start', 'audio_completed', 'audio_cancelled'] },
            timestamp: { $gte: startOfDay, $lte: endOfDay }
        }).select('payload.interaction_type').lean();

        const starts = audioEvents.filter(e => e.payload.interaction_type === 'audio_start').length;
        const completions = audioEvents.filter(e => e.payload.interaction_type === 'audio_completed').length;
        const cancellations = audioEvents.filter(e => e.payload.interaction_type === 'audio_cancelled').length;

        return {
            audio_starts: starts,
            audio_completions: completions,
            audio_cancellations: cancellations
        };
    }

    /**
     * Get duration statistics from raw events
     */
    async getDurationStats(poiId, startOfDay, endOfDay) {
        const exitEvents = await IntelligenceEventRaw.find({
            event_family: 'LocationEvent',
            'payload.poi_id': String(poiId),
            'payload.session_event': 'exit',
            'payload.duration_seconds': { $exists: true },
            timestamp: { $gte: startOfDay, $lte: endOfDay }
        }).select('payload.duration_seconds').lean();

        if (exitEvents.length === 0) {
            return {
                total_duration: 0,
                avg_duration: 0,
                min_duration: 0,
                max_duration: 0
            };
        }

        const durations = exitEvents.map(e => e.payload.duration_seconds);
        const totalDuration = durations.reduce((sum, d) => sum + d, 0);
        const avgDuration = Math.round(totalDuration / durations.length);

        return {
            total_duration: totalDuration,
            avg_duration: avgDuration,
            min_duration: Math.min(...durations),
            max_duration: Math.max(...durations)
        };
    }

    /**
     * Calculate engagement score (0-100)
     * Formula: (unique_visitors * 0.4) + (audio_completion_rate * 0.3) + (avg_duration_score * 0.3)
     */
    calculateEngagementScore({ uniqueVisitors, audioCompletions, audioStarts, avgDuration }) {
        // Visitor score (0-40 points, capped at 100 visitors)
        const visitorScore = Math.min(uniqueVisitors, 100) * 0.4;

        // Audio completion rate (0-30 points)
        const audioCompletionRate = audioStarts > 0 ? (audioCompletions / audioStarts) : 0;
        const audioScore = audioCompletionRate * 30;

        // Duration score (0-30 points, optimal duration: 60-180 seconds)
        let durationScore = 0;
        if (avgDuration >= 60 && avgDuration <= 180) {
            durationScore = 30; // Optimal range
        } else if (avgDuration > 0 && avgDuration < 60) {
            durationScore = (avgDuration / 60) * 30; // Scale up to 30
        } else if (avgDuration > 180) {
            durationScore = Math.max(0, 30 - ((avgDuration - 180) / 60) * 5); // Decay after 180s
        }

        return Math.round(visitorScore + audioScore + durationScore);
    }

    /**
     * Aggregate yesterday's stats (for scheduled job)
     */
    async aggregateYesterday() {
        const yesterday = new Date();
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        yesterday.setUTCHours(0, 0, 0, 0);

        return this.aggregateDate(yesterday);
    }

    /**
     * Backfill stats for a date range
     */
    async backfillDateRange(startDate, endDate) {
        const results = [];
        const currentDate = new Date(startDate);

        while (currentDate <= endDate) {
            const stats = await this.aggregateDate(new Date(currentDate));
            results.push(...stats);
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        }

        return results;
    }
}

module.exports = new PoiDailyStatsAggregatorService();
