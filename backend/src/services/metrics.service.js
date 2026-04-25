const SystemEvent = require('../models/system-event.model');
const logger = require('../utils/logger');

/**
 * METRICS TRACKING SERVICE
 * Real-time system metrics for monitoring and alerting
 *
 * Tracks:
 * - Scans per minute
 * - Unlock success rate
 * - Audio play success rate
 * - API latency (p50, p95, p99)
 * - Error rate
 */

class MetricsService {
    constructor() {
        // In-memory metrics cache (last 5 minutes)
        this.metricsCache = {
            scansPerMinute: [],
            unlockSuccessRate: [],
            audioSuccessRate: [],
            apiLatency: [],
            errorRate: []
        };

        // Start metrics aggregation
        this.startMetricsAggregation();
    }

    /**
     * Start periodic metrics aggregation (every minute)
     */
    startMetricsAggregation() {
        setInterval(async () => {
            await this.aggregateMetrics();
        }, 60000); // Every 1 minute

        logger.info('[METRICS] Metrics aggregation started (1-minute intervals)');
    }

    /**
     * Aggregate metrics from events
     */
    async aggregateMetrics() {
        try {
            const oneMinuteAgo = new Date(Date.now() - 60000);
            const fiveMinutesAgo = new Date(Date.now() - 300000);

            // Scans per minute
            const scansPerMinute = await this.getScansPerMinute(oneMinuteAgo);
            this.metricsCache.scansPerMinute.push({
                timestamp: new Date(),
                value: scansPerMinute
            });

            // Unlock success rate
            const unlockSuccessRate = await this.getUnlockSuccessRate(fiveMinutesAgo);
            this.metricsCache.unlockSuccessRate.push({
                timestamp: new Date(),
                value: unlockSuccessRate
            });

            // Audio play success rate
            const audioSuccessRate = await this.getAudioSuccessRate(fiveMinutesAgo);
            this.metricsCache.audioSuccessRate.push({
                timestamp: new Date(),
                value: audioSuccessRate
            });

            // API latency
            const apiLatency = await this.getApiLatency(fiveMinutesAgo);
            this.metricsCache.apiLatency.push({
                timestamp: new Date(),
                value: apiLatency
            });

            // Error rate
            const errorRate = await this.getErrorRate(fiveMinutesAgo);
            this.metricsCache.errorRate.push({
                timestamp: new Date(),
                value: errorRate
            });

            // Keep only last 5 minutes of data
            this.cleanupCache();

            logger.info('[METRICS] Metrics aggregated:', {
                scansPerMinute,
                unlockSuccessRate: `${unlockSuccessRate}%`,
                audioSuccessRate: `${audioSuccessRate}%`,
                apiLatency: `${apiLatency.p95}ms (p95)`,
                errorRate: `${errorRate}%`
            });
        } catch (error) {
            logger.error('[METRICS] Failed to aggregate metrics:', error);
        }
    }

    /**
     * Get scans per minute
     */
    async getScansPerMinute(since) {
        try {
            const count = await SystemEvent.countDocuments({
                eventType: 'QR_SCAN',
                timestamp: { $gte: since }
            });

            return count;
        } catch (error) {
            logger.error('[METRICS] Failed to get scans per minute:', error);
            return 0;
        }
    }

    /**
     * Get unlock success rate (%)
     */
    async getUnlockSuccessRate(since) {
        try {
            const total = await SystemEvent.countDocuments({
                eventType: { $in: ['ZONE_UNLOCK', 'POI_UNLOCK'] },
                timestamp: { $gte: since }
            });

            if (total === 0) return 100;

            const successful = await SystemEvent.countDocuments({
                eventType: { $in: ['ZONE_UNLOCK', 'POI_UNLOCK'] },
                status: 'SUCCESS',
                timestamp: { $gte: since }
            });

            return Math.round((successful / total) * 100);
        } catch (error) {
            logger.error('[METRICS] Failed to get unlock success rate:', error);
            return 0;
        }
    }

    /**
     * Get audio play success rate (%)
     */
    async getAudioSuccessRate(since) {
        try {
            const total = await SystemEvent.countDocuments({
                eventType: { $in: ['AUDIO_PLAY', 'AUDIO_FAILED'] },
                timestamp: { $gte: since }
            });

            if (total === 0) return 100;

            const successful = await SystemEvent.countDocuments({
                eventType: 'AUDIO_PLAY',
                status: 'SUCCESS',
                timestamp: { $gte: since }
            });

            return Math.round((successful / total) * 100);
        } catch (error) {
            logger.error('[METRICS] Failed to get audio success rate:', error);
            return 0;
        }
    }

    /**
     * Get API latency percentiles (p50, p95, p99)
     */
    async getApiLatency(since) {
        try {
            const events = await SystemEvent.find({
                'metadata.responseTime': { $exists: true, $ne: null },
                timestamp: { $gte: since }
            })
                .select('metadata.responseTime')
                .lean();

            if (events.length === 0) {
                return { p50: 0, p95: 0, p99: 0 };
            }

            const latencies = events
                .map(e => e.metadata.responseTime)
                .sort((a, b) => a - b);

            const p50Index = Math.floor(latencies.length * 0.5);
            const p95Index = Math.floor(latencies.length * 0.95);
            const p99Index = Math.floor(latencies.length * 0.99);

            return {
                p50: Math.round(latencies[p50Index] || 0),
                p95: Math.round(latencies[p95Index] || 0),
                p99: Math.round(latencies[p99Index] || 0)
            };
        } catch (error) {
            logger.error('[METRICS] Failed to get API latency:', error);
            return { p50: 0, p95: 0, p99: 0 };
        }
    }

    /**
     * Get error rate (%)
     */
    async getErrorRate(since) {
        try {
            const total = await SystemEvent.countDocuments({
                timestamp: { $gte: since }
            });

            if (total === 0) return 0;

            const errors = await SystemEvent.countDocuments({
                status: 'FAILED',
                timestamp: { $gte: since }
            });

            return Math.round((errors / total) * 100);
        } catch (error) {
            logger.error('[METRICS] Failed to get error rate:', error);
            return 0;
        }
    }

    /**
     * Get current metrics snapshot
     */
    getCurrentMetrics() {
        const getLatest = (arr) => arr.length > 0 ? arr[arr.length - 1].value : null;

        return {
            scansPerMinute: getLatest(this.metricsCache.scansPerMinute),
            unlockSuccessRate: getLatest(this.metricsCache.unlockSuccessRate),
            audioSuccessRate: getLatest(this.metricsCache.audioSuccessRate),
            apiLatency: getLatest(this.metricsCache.apiLatency),
            errorRate: getLatest(this.metricsCache.errorRate),
            timestamp: new Date()
        };
    }

    /**
     * Get metrics history (last 5 minutes)
     */
    getMetricsHistory() {
        return {
            scansPerMinute: this.metricsCache.scansPerMinute,
            unlockSuccessRate: this.metricsCache.unlockSuccessRate,
            audioSuccessRate: this.metricsCache.audioSuccessRate,
            apiLatency: this.metricsCache.apiLatency,
            errorRate: this.metricsCache.errorRate
        };
    }

    /**
     * Get metrics summary for time range
     */
    async getMetricsSummary(startDate, endDate) {
        try {
            const start = new Date(startDate);
            const end = new Date(endDate);

            const [
                totalScans,
                unlockSuccessRate,
                audioSuccessRate,
                apiLatency,
                errorRate
            ] = await Promise.all([
                SystemEvent.countDocuments({
                    eventType: 'QR_SCAN',
                    timestamp: { $gte: start, $lte: end }
                }),
                this.getUnlockSuccessRate(start),
                this.getAudioSuccessRate(start),
                this.getApiLatency(start),
                this.getErrorRate(start)
            ]);

            return {
                totalScans,
                unlockSuccessRate,
                audioSuccessRate,
                apiLatency,
                errorRate,
                period: {
                    start: start.toISOString(),
                    end: end.toISOString()
                }
            };
        } catch (error) {
            logger.error('[METRICS] Failed to get metrics summary:', error);
            return null;
        }
    }

    /**
     * Check if metrics are healthy
     */
    isHealthy() {
        const current = this.getCurrentMetrics();

        const checks = {
            unlockSuccessRate: current.unlockSuccessRate >= 95,
            audioSuccessRate: current.audioSuccessRate >= 95,
            apiLatencyP95: current.apiLatency?.p95 <= 500,
            errorRate: current.errorRate <= 5
        };

        const healthy = Object.values(checks).every(check => check);

        return {
            healthy,
            checks,
            metrics: current
        };
    }

    /**
     * Cleanup old cache data (keep last 5 minutes)
     */
    cleanupCache() {
        const fiveMinutesAgo = Date.now() - 300000;

        Object.keys(this.metricsCache).forEach(key => {
            this.metricsCache[key] = this.metricsCache[key].filter(
                item => item.timestamp.getTime() > fiveMinutesAgo
            );
        });
    }
}

module.exports = new MetricsService();
