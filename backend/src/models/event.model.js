const mongoose = require('mongoose');

/**
 * Event Model
 * Stores system events for analytics and auditing
 */

const eventSchema = new mongoose.Schema({
    eventType: {
        type: String,
        required: true,
        enum: [
            'ZONE_SCAN',
            'ZONE_DOWNLOAD',
            'QR_TOKEN_GENERATED',
            'QR_TOKEN_REVOKED',
            'ZONE_PURCHASED',
            'ACCESS_DENIED'
        ],
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        index: true
    },
    zoneId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Zone',
        default: null,
        index: true
    },
    zoneCode: {
        type: String,
        default: null,
        index: true
    },
    zoneName: {
        type: String,
        default: null
    },
    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    jti: {
        type: String,
        default: null
    },
    expiresAt: {
        type: Date,
        default: null
    },
    hasAccess: {
        type: Boolean,
        default: null
    },
    poiCount: {
        type: Number,
        default: null
    },
    page: {
        type: Number,
        default: null
    },
    totalPages: {
        type: Number,
        default: null
    },
    cursor: {
        type: String,
        default: null
    },
    ip: {
        type: String,
        default: null
    },
    userAgent: {
        type: String,
        default: null
    },
    success: {
        type: Boolean,
        required: true,
        index: true
    },
    error: {
        type: String,
        default: null
    },
    responseTime: {
        type: Number,
        default: null
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    }
}, {
    timestamps: true
});

// Indexes for common queries
eventSchema.index({ eventType: 1, createdAt: -1 });
eventSchema.index({ userId: 1, createdAt: -1 });
eventSchema.index({ zoneCode: 1, createdAt: -1 });
eventSchema.index({ success: 1, eventType: 1 });

// TTL index: auto-delete events older than 90 days
eventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 * 24 * 60 * 60

module.exports = mongoose.model('Event', eventSchema);
