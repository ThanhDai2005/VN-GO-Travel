const { AppError } = require('../middlewares/error.middleware');
const deviceSessionRepository = require('../repositories/device-session.repository');
const { getClientIP } = require('../utils/ip-helper');

// Must exceed heartbeat interval + network jitter, or admin UI flickers offline between beats.
// Giảm từ 25s xuống 8s để phản ánh trạng thái offline nhanh hơn (heartbeat interval = 3s)
const ONLINE_GRACE_MS = 8 * 1000;

function toDeviceResponse(row) {
    const now = Date.now();
    const lastSeenMs = row.lastSeenAt ? new Date(row.lastSeenAt).getTime() : 0;
    const online = Boolean(row.isOnline) && lastSeenMs > 0 && now - lastSeenMs <= ONLINE_GRACE_MS;

    return {
        id: row._id,
        deviceId: row.deviceId,
        userId: row.user || null,
        email: row.email || '',
        ipAddress: row.ipAddress || '',
        deviceName: row.deviceName || '',
        manufacturer: row.manufacturer || '',
        model: row.model || '',
        platform: row.platform || '',
        osVersion: row.osVersion || '',
        appVersion: row.appVersion || '',
        isOnline: online,
        lastSeenAt: row.lastSeenAt,
        sessionStartedAt: row.sessionStartedAt,
        lastOfflineAt: row.lastOfflineAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
    };
}

exports.heartbeat = async (req, res, next) => {
    try {
        const {
            deviceId,
            deviceName = '',
            manufacturer = '',
            model = '',
            platform = '',
            osVersion = '',
            appVersion = ''
        } = req.body || {};

        if (typeof deviceId !== 'string' || !deviceId.trim()) {
            throw new AppError('deviceId is required', 400);
        }

        const row = await deviceSessionRepository.upsertHeartbeat({
            deviceId: deviceId.trim(),
            userId: req.user?._id || null,
            email: req.user?.email || '',
            ipAddress: getClientIP(req),
            deviceName,
            manufacturer,
            model,
            platform,
            osVersion,
            appVersion
        });

        res.status(200).json({
            success: true,
            data: toDeviceResponse(row.toObject())
        });
    } catch (error) {
        next(error);
    }
};

exports.offline = async (req, res, next) => {
    try {
        const { deviceId } = req.body || {};
        if (typeof deviceId !== 'string' || !deviceId.trim()) {
            throw new AppError('deviceId is required', 400);
        }

        const row = await deviceSessionRepository.markOffline(deviceId.trim());
        res.status(200).json({
            success: true,
            data: row ? toDeviceResponse(row.toObject()) : null
        });
    } catch (error) {
        next(error);
    }
};

exports.adminList = async (req, res, next) => {
    try {
        const rows = await deviceSessionRepository.listAll();
        const devices = rows.map(toDeviceResponse);
        const onlineCount = devices.filter((d) => d.isOnline).length;

        res.status(200).json({
            success: true,
            data: {
                onlineCount,
                totalCount: devices.length,
                devices
            }
        });
    } catch (error) {
        next(error);
    }
};
