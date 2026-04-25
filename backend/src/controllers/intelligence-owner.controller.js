const intelligenceOwnerMetricsService = require('../services/intelligence-owner-metrics.service');
const { AppError } = require('../middlewares/error.middleware');

/**
 * Intelligence Owner Analytics Controller
 * Provides analytics endpoints for POI owners
 */
class IntelligenceOwnerController {
    constructor() {
        // Bind methods to instance
        this.getPoiVisits = this.getPoiVisits.bind(this);
        this.getAudioStats = this.getAudioStats.bind(this);
        this.getVisitDuration = this.getVisitDuration.bind(this);
        this.getPoiSummary = this.getPoiSummary.bind(this);
    }

    /**
     * GET /api/v1/owner/intelligence/poi-visits/:poiId
     * Get POI visit statistics
     */
    async getPoiVisits(req, res, next) {
        try {
            const { poiId } = req.params;
            const { from, to } = req.query;
            const ownerId = req.user._id;

            const visits = await intelligenceOwnerMetricsService.getPoiVisits(
                poiId,
                ownerId,
                from,
                to
            );

            res.json({
                success: true,
                data: visits
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/v1/owner/intelligence/audio-stats/:poiId
     * Get audio playback statistics
     */
    async getAudioStats(req, res, next) {
        try {
            const { poiId } = req.params;
            const { from, to } = req.query;
            const ownerId = req.user._id;

            const stats = await intelligenceOwnerMetricsService.getAudioStats(
                poiId,
                ownerId,
                from,
                to
            );

            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/v1/owner/intelligence/visit-duration/:poiId
     * Get visit duration statistics
     */
    async getVisitDuration(req, res, next) {
        try {
            const { poiId } = req.params;
            const { from, to } = req.query;
            const ownerId = req.user._id;

            const duration = await intelligenceOwnerMetricsService.getVisitDuration(
                poiId,
                ownerId,
                from,
                to
            );

            res.json({
                success: true,
                data: duration
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/v1/owner/intelligence/summary/:poiId
     * Get comprehensive POI analytics summary
     */
    async getPoiSummary(req, res, next) {
        try {
            const { poiId } = req.params;
            const { from, to } = req.query;
            const ownerId = req.user._id;

            const summary = await intelligenceOwnerMetricsService.getPoiSummary(
                poiId,
                ownerId,
                from,
                to
            );

            res.json({
                success: true,
                data: summary
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new IntelligenceOwnerController();
