const mongoose = require('mongoose');

const scanLogSchema = new mongoose.Schema({
    zoneCode: {
        type: String,
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },
    ip: String,
    userAgent: String,
    status: {
        type: String,
        enum: ['SUCCESS', 'FAILED', 'EXPIRED', 'REVOKED'],
        default: 'SUCCESS'
    },
    error: String,
    deviceInfo: {
        platform: String,
        version: String
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true
});

// Index for analytics: Scans per zone per day
scanLogSchema.index({ zoneCode: 1, timestamp: -1 });

module.exports = mongoose.model('ScanLog', scanLogSchema);
