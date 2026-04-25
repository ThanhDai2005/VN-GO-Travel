const userAudioQueueService = require('../services/user-audio-queue.service');

/**
 * User Audio Queue Controller
 * Handles HTTP endpoints for per-user audio queue
 */
class UserAudioQueueController {
    constructor() {
        this.enqueue = this.enqueue.bind(this);
        this.complete = this.complete.bind(this);
        this.interrupt = this.interrupt.bind(this);
        this.cancelAll = this.cancelAll.bind(this);
        this.getMyState = this.getMyState.bind(this);
        this.getStats = this.getStats.bind(this);
    }

    /**
     * POST /api/v1/user-audio-queue/enqueue
     * Enqueue audio for current user
     */
    async enqueue(req, res, next) {
        try {
            const { poiCode, audioId, language, narrationLength } = req.body;
            const userId = req.user._id;
            const deviceId = req.headers['x-device-id'] || 'unknown';

            if (!poiCode || !audioId) {
                return res.status(400).json({
                    success: false,
                    message: 'poiCode and audioId are required'
                });
            }

            const result = await userAudioQueueService.enqueue(
                String(userId),
                poiCode,
                audioId,
                deviceId,
                { language, narrationLength }
            );

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[USER-AUDIO-QUEUE-CONTROLLER] Enqueue error:', error);
            next(error);
        }
    }

    /**
     * POST /api/v1/user-audio-queue/complete
     * Mark current audio as completed and play next
     */
    async complete(req, res, next) {
        try {
            const userId = req.user._id;
            const deviceId = req.headers['x-device-id'] || 'unknown';

            const result = await userAudioQueueService.completeAudio(
                String(userId),
                deviceId
            );

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[USER-AUDIO-QUEUE-CONTROLLER] Complete error:', error);
            next(error);
        }
    }

    /**
     * POST /api/v1/user-audio-queue/interrupt
     * Interrupt current audio and play next
     */
    async interrupt(req, res, next) {
        try {
            const { reason } = req.body;
            const userId = req.user._id;
            const deviceId = req.headers['x-device-id'] || 'unknown';

            const result = await userAudioQueueService.interruptAudio(
                String(userId),
                deviceId,
                reason || 'user_action'
            );

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[USER-AUDIO-QUEUE-CONTROLLER] Interrupt error:', error);
            next(error);
        }
    }

    /**
     * POST /api/v1/user-audio-queue/cancel-all
     * Cancel current audio and clear queue
     */
    async cancelAll(req, res, next) {
        try {
            const userId = req.user._id;
            const deviceId = req.headers['x-device-id'] || 'unknown';

            const result = await userAudioQueueService.cancelAll(
                String(userId),
                deviceId
            );

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[USER-AUDIO-QUEUE-CONTROLLER] Cancel all error:', error);
            next(error);
        }
    }

    /**
     * GET /api/v1/user-audio-queue/my-state
     * Get current user's audio state
     */
    async getMyState(req, res, next) {
        try {
            const userId = req.user._id;

            const state = await userAudioQueueService.getUserState(String(userId));

            res.json({
                success: true,
                data: state
            });
        } catch (error) {
            console.error('[USER-AUDIO-QUEUE-CONTROLLER] Get state error:', error);
            next(error);
        }
    }

    /**
     * GET /api/v1/user-audio-queue/stats
     * Get system statistics
     */
    async getStats(req, res, next) {
        try {
            const stats = userAudioQueueService.getStats();

            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('[USER-AUDIO-QUEUE-CONTROLLER] Get stats error:', error);
            next(error);
        }
    }
}

module.exports = new UserAudioQueueController();
