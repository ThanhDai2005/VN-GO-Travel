const mongoose = require('mongoose');

/**
 * POI Daily Stats - Aggregated daily metrics per POI
 * Optimized for fast dashboard queries
 *
 * Aggregated from: PoiHourlyStats
 * Updated by: Daily rollup job
 */
const poiDailyStatsSchema = new mongoose.Schema({
    poi_id: {
        type: String,
        required: true,
        index: true
    },
    date: {
        type: Date,
        required: true,
        index: true
    },

    // Visit metrics
    total_visits: {
        type: Number,
        default: 0,
        min: 0
    },
    unique_visitors: {
        type: Number,
        default: 0,
        min: 0
    },

    // Audio metrics
    audio_starts: {
        type: Number,
        default: 0,
        min: 0
    },
    audio_completions: {
        type: Number,
        default: 0,
        min: 0
    },
    audio_cancellations: {
        type: Number,
        default: 0,
        min: 0
    },

    // Duration metrics (in seconds)
    total_duration: {
        type: Number,
        default: 0,
        min: 0
    },
    avg_duration: {
        type: Number,
        default: 0,
        min: 0
    },
    min_duration: {
        type: Number,
        default: 0,
        min: 0
    },
    max_duration: {
        type: Number,
        default: 0,
        min: 0
    },

    // Engagement score (calculated)
    engagement_score: {
        type: Number,
        default: 0,
        min: 0
    },

    // Metadata
    created_at: {
        type: Date,
        default: () => new Date()
    },
    updated_at: {
        type: Date,
        default: () => new Date()
    }
}, {
    collection: 'poi_daily_stats',
    timestamps: false
});

// Compound index for efficient queries
poiDailyStatsSchema.index(
    { poi_id: 1, date: -1 },
    { name: 'idx_poi_date' }
);

// Index for date range queries
poiDailyStatsSchema.index(
    { date: -1 },
    { name: 'idx_date_desc' }
);

// Index for top POIs queries
poiDailyStatsSchema.index(
    { date: -1, unique_visitors: -1 },
    { name: 'idx_date_visitors' }
);

poiDailyStatsSchema.index(
    { date: -1, engagement_score: -1 },
    { name: 'idx_date_engagement' }
);

// Unique constraint
poiDailyStatsSchema.index(
    { poi_id: 1, date: 1 },
    { unique: true, name: 'uniq_poi_date' }
);

module.exports = mongoose.model('PoiDailyStats', poiDailyStatsSchema);
