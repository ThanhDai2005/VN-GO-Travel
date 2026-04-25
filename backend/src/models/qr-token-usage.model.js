const mongoose = require('mongoose');

/**
 * QR Token Usage Model
 * Tracks QR token usage for abuse detection and blacklisting
 */

const qrTokenUsageSchema = new mongoose.Schema({
    token: {
        type: String,
        required: true,
        index: true
    },
    poiCode: {
        type: String,
        required: true,
        index: true
    },
    scanCount: {
        type: Number,
        default: 0,
        min: 0
    },
    lastScannedAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    blacklisted: {
        type: Boolean,
        default: false,
        index: true
    },
    blacklistedAt: {
        type: Date,
        default: null
    },
    blacklistedReason: {
        type: String,
        default: null
    },
    blacklistedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    // Track scan patterns
    scanHistory: [{
        scannedAt: Date,
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        ip: String,
        deviceId: String
    }]
}, {
    timestamps: true
});

// Compound index for efficient queries
qrTokenUsageSchema.index({ poiCode: 1, lastScannedAt: -1 });
qrTokenUsageSchema.index({ blacklisted: 1, lastScannedAt: -1 });

// Virtual: Is token abusive (>100 scans/hour)
qrTokenUsageSchema.virtual('isAbusive').get(function() {
    if (!this.lastScannedAt) return false;

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentScans = this.scanHistory.filter(scan => scan.scannedAt > oneHourAgo);

    return recentScans.length > 100;
});

// Method: Record scan
qrTokenUsageSchema.methods.recordScan = function(userId, ip, deviceId) {
    this.scanCount += 1;
    this.lastScannedAt = new Date();

    // Keep only last 200 scans in history (prevent unbounded growth)
    if (this.scanHistory.length >= 200) {
        this.scanHistory = this.scanHistory.slice(-100);
    }

    this.scanHistory.push({
        scannedAt: new Date(),
        userId: userId || null,
        ip,
        deviceId
    });

    return this.save();
};

// Method: Blacklist token
qrTokenUsageSchema.methods.blacklist = function(reason, adminUserId) {
    this.blacklisted = true;
    this.blacklistedAt = new Date();
    this.blacklistedReason = reason;
    this.blacklistedBy = adminUserId || null;

    return this.save();
};

// Method: Unblacklist token
qrTokenUsageSchema.methods.unblacklist = function() {
    this.blacklisted = false;
    this.blacklistedAt = null;
    this.blacklistedReason = null;
    this.blacklistedBy = null;

    return this.save();
};

// Static: Find or create token usage
qrTokenUsageSchema.statics.findOrCreate = async function(token, poiCode) {
    let usage = await this.findOne({ token });

    if (!usage) {
        usage = await this.create({
            token,
            poiCode,
            scanCount: 0,
            scanHistory: []
        });
    }

    return usage;
};

// Static: Get abusive tokens (>100 scans/hour)
qrTokenUsageSchema.statics.getAbusiveTokens = async function() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const tokens = await this.find({
        lastScannedAt: { $gte: oneHourAgo },
        blacklisted: false
    });

    return tokens.filter(token => {
        const recentScans = token.scanHistory.filter(scan => scan.scannedAt > oneHourAgo);
        return recentScans.length > 100;
    });
};

const QrTokenUsage = mongoose.model('QrTokenUsage', qrTokenUsageSchema);

module.exports = QrTokenUsage;
