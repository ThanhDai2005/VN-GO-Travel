const mongoose = require('mongoose');

const deviceSessionSchema = new mongoose.Schema(
    {
        deviceId: { type: String, required: true, unique: true, index: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        email: { type: String, default: '' },
        ipAddress: { type: String, default: '' },
        deviceName: { type: String, default: '' },
        manufacturer: { type: String, default: '' },
        model: { type: String, default: '' },
        platform: { type: String, default: '' },
        osVersion: { type: String, default: '' },
        appVersion: { type: String, default: '' },
        isOnline: { type: Boolean, default: false },
        sessionStartedAt: { type: Date, default: null },
        lastSeenAt: { type: Date, default: null },
        lastOfflineAt: { type: Date, default: null }
    },
    { timestamps: true }
);

deviceSessionSchema.index({ isOnline: 1, lastSeenAt: -1 });

module.exports = mongoose.model('DeviceSession', deviceSessionSchema);
