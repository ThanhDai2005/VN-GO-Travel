const intelligenceEventsService = require('./intelligence-events.service');
const { AppError } = require('../middlewares/error.middleware');

/**
 * POI Visit Session Service
 * Tracks enter/exit events for session-level analytics
 */
class PoiVisitSessionService {
    /**
     * Record POI enter event
     */
    async recordEnter(deviceId, userId, poiId, poiCode, sessionId) {
        if (!deviceId || !poiId || !poiCode || !sessionId) {
            throw new AppError('Missing required parameters for enter event', 400);
        }

        const event = {
            contractVersion: 'v2',
            deviceId,
            correlationId: sessionId,
            authState: userId ? 'logged_in' : 'guest',
            sourceSystem: 'GAK',
            rbelEventFamily: 'location',
            rbelMappingVersion: '7.3.1',
            timestamp: new Date().toISOString(),
            userId: userId ? String(userId) : null,
            poiId,
            payload: {
                poi_id: poiId,
                poi_code: poiCode,
                session_event: 'enter',
                session_id: sessionId
            }
        };

        try {
            await intelligenceEventsService.ingestSingle(event, null, { headerDeviceId: deviceId });
            console.log(`[POI-VISIT-SESSION] Recorded enter event for ${deviceId} at ${poiCode}`);
            return { success: true, sessionId };
        } catch (error) {
            console.error('[POI-VISIT-SESSION] Failed to record enter event:', error);
            throw new AppError('Failed to record enter event', 500);
        }
    }

    /**
     * Record POI exit event
     */
    async recordExit(deviceId, userId, poiId, poiCode, sessionId, durationSeconds) {
        if (!deviceId || !poiId || !poiCode || !sessionId) {
            throw new AppError('Missing required parameters for exit event', 400);
        }

        const event = {
            contractVersion: 'v2',
            deviceId,
            correlationId: sessionId,
            authState: userId ? 'logged_in' : 'guest',
            sourceSystem: 'GAK',
            rbelEventFamily: 'location',
            rbelMappingVersion: '7.3.1',
            timestamp: new Date().toISOString(),
            userId: userId ? String(userId) : null,
            poiId,
            payload: {
                poi_id: poiId,
                poi_code: poiCode,
                session_event: 'exit',
                session_id: sessionId,
                duration_seconds: durationSeconds || 0
            }
        };

        try {
            await intelligenceEventsService.ingestSingle(event, null, { headerDeviceId: deviceId });
            console.log(`[POI-VISIT-SESSION] Recorded exit event for ${deviceId} at ${poiCode} (${durationSeconds}s)`);
            return { success: true, sessionId, durationSeconds };
        } catch (error) {
            console.error('[POI-VISIT-SESSION] Failed to record exit event:', error);
            throw new AppError('Failed to record exit event', 500);
        }
    }
}

module.exports = new PoiVisitSessionService();
