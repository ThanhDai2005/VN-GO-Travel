const mongoose = require('mongoose');

/**
 * SYSTEM EVENT LOG
 * Comprehensive event tracking for observability and debugging
 *
 * Tracks:
 * - QR scan events
 * - Zone/POI unlocks
 * - Credit transactions
 * - Audio playback
 * - Errors and failures
 */

const systemEventSchema = new mongoose.Schema({
    eventType: {
        type: String,
        required: true,
        enum: [
            'QR_SCAN',
            'QR_SCAN_FAILED',
            'ZONE_UNLOCK',
            'POI_UNLOCK',
            'AUDIO_PLAY',
            'AUDIO_FAILED',
            'CREDIT_DEBIT',
            'CREDIT_CREDIT',
            'API_ERROR',
            'RATE_LIMIT_HIT',
            'AUTH_SUCCESS',
            'AUTH_FAILED'
        ],
        index: true
    },

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },

    zoneId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Zone'
    },

    poiId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Poi'
    },

    status: {
        type: String,
        enum: ['SUCCESS', 'FAILED', 'PENDING'],
        default: 'SUCCESS',
        index: true
    },

    metadata: {
        poiCode: String,
        zoneCode: String,
        qrToken: String,
        creditAmount: Number,
        errorMessage: String,
        errorCode: String,
        ipAddress: String,
        deviceId: String,
        userAgent: String,
        responseTime: Number, // milliseconds
        retryCount: Number
    },

    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true
});

// Compound indexes for common queries
systemEventSchema.index({ eventType: 1, timestamp: -1 });
systemEventSchema.index({ userId: 1, timestamp: -1 });
systemEventSchema.index({ status: 1, timestamp: -1 });
systemEventSchema.index({ eventType: 1, status: 1, timestamp: -1 });

// TTL index - auto-delete events older than 30 days
systemEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model('SystemEvent', systemEventSchema);
