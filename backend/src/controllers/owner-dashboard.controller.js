const ownerDashboardService = require('../services/owner-dashboard.service');
const { AppError } = require('../middlewares/error.middleware');

/**
 * Owner Dashboard Controller
 * High-performance analytics endpoints for owner dashboard
 */
class OwnerDashboardController {
    constructor() {
        this.getPoiOverview = this.getPoiOverview.bind(this);
        this.getTopPois = this.getTopPois.bind(this);
        this.getTrends = this.getTrends.bind(this);
        this.getHeatmap = this.getHeatmap.bind(this);
        this.clearCache = this.clearCache.bind(this);
    }

    /**
     * GET /api/v1/dashboard/poi/:code
     * Get POI overview with stats summary
     */
    async getPoiOverview(req, res, next) {
        try {
            const { code } = req.params;
            const { from, to } = req.query;
            const ownerId = req.user._id;

            const overview = await ownerDashboardService.getPoiOverview(
                code,
                ownerId,
                { from, to }
            );

            res.json({
                success: true,
                data: overview
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/v1/dashboard/top-pois
     * Get top performing POIs (admin only)
     */
    async getTopPois(req, res, next) {
        try {
            const { metric = 'visitors', limit = 10, from, to } = req.query;
            const userId = req.user._id;

            const topPois = await ownerDashboardService.getTopPois(
                userId,
                { metric, limit, from, to }
            );

            res.json({
                success: true,
                data: topPois
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/v1/dashboard/trends/:poiId
     * Get time series data for trends
     */
    async getTrends(req, res, next) {
        try {
            const { poiId } = req.params;
            const { from, to, granularity = 'daily' } = req.query;
            const ownerId = req.user._id;

            const trends = await ownerDashboardService.getTrends(
                poiId,
                ownerId,
                { from, to, granularity }
            );

            res.json({
                success: true,
                data: trends
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/v1/dashboard/heatmap/:poiId
     * Get heatmap data (hourly activity)
     */
    async getHeatmap(req, res, next) {
        try {
            const { poiId } = req.params;
            const { from, to } = req.query;
            const ownerId = req.user._id;

            const heatmap = await ownerDashboardService.getHeatmap(
                poiId,
                ownerId,
                { from, to }
            );

            res.json({
                success: true,
                data: heatmap
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/v1/dashboard/cache/clear
     * Clear dashboard cache (admin only)
     */
    async clearCache(req, res, next) {
        try {
            ownerDashboardService.clearCache();

            res.json({
                success: true,
                message: 'Dashboard cache cleared'
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new OwnerDashboardController();
