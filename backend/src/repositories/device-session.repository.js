const DeviceSession = require('../models/device-session.model');

class DeviceSessionRepository {
    async upsertHeartbeat({
        deviceId,
        userId = null,
        email = '',
        ipAddress = '',
        deviceName = '',
        manufacturer = '',
        model = '',
        platform = '',
        osVersion = '',
        appVersion = ''
    }) {
        const now = new Date();
        const existing = await DeviceSession.findOne({ deviceId }).select('_id sessionStartedAt');
        const sessionStartedAt = existing?.sessionStartedAt || now;

        return await DeviceSession.findOneAndUpdate(
            { deviceId },
            {
                $set: {
                    user: userId || null,
                    email: email || '',
                    ipAddress: ipAddress || '',
                    deviceName: deviceName || '',
                    manufacturer: manufacturer || '',
                    model: model || '',
                    platform: platform || '',
                    osVersion: osVersion || '',
                    appVersion: appVersion || '',
                    isOnline: true,
                    sessionStartedAt,
                    lastSeenAt: now
                }
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
    }

    async markOffline(deviceId) {
        return await DeviceSession.findOneAndUpdate(
            { deviceId },
            {
                $set: {
                    isOnline: false,
                    lastOfflineAt: new Date()
                }
            },
            { new: true }
        );
    }

    async listAll() {
        return await DeviceSession.find({})
            .sort({ lastSeenAt: -1, updatedAt: -1 })
            .lean();
    }
}

module.exports = new DeviceSessionRepository();
