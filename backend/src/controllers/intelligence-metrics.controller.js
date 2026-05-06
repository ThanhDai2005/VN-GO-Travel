const intelligenceMetricsService = require('../services/intelligence-metrics.service');

exports.getEventsByFamily = async (req, res, next) => {
    try {
        const { start, end, granularity } = req.query;
        const rows = await intelligenceMetricsService.getEventsByFamily({
            start,
            end,
            granularity
        });
        res.status(200).json(rows);
    } catch (e) {
        next(e);
    }
};

exports.getEventsByAuthState = async (req, res, next) => {
    try {
        const { start, end, granularity } = req.query;
        const rows = await intelligenceMetricsService.getEventsByAuthState({
            start,
            end,
            granularity
        });
        res.status(200).json(rows);
    } catch (e) {
        next(e);
    }
};

exports.getTimeline = async (req, res, next) => {
    try {
        const { start, end, granularity } = req.query;
        const rows = await intelligenceMetricsService.getTimeline({
            start,
            end,
            granularity
        });
        res.status(200).json(rows);
    } catch (e) {
        next(e);
    }
};

exports.getGeoHeatmap = async (req, res, next) => {
    try {
        const { start, end } = req.query;
        const rows = await intelligenceMetricsService.getGeoHeatmap({
            start,
            end
        });
        res.status(200).json(rows);
    } catch (e) {
        next(e);
    }
};

exports.getOwnerTimeline = async (req, res, next) => {
    try {
        const { start, end, granularity } = req.query;
        const rows = await intelligenceMetricsService.getOwnerTimeline(req.user._id, {
            start,
            end,
            granularity
        });
        res.status(200).json(rows);
    } catch (e) {
        next(e);
    }
};

exports.getOwnerEventsByFamily = async (req, res, next) => {
    try {
        const { start, end } = req.query;
        const rows = await intelligenceMetricsService.getOwnerEventsByFamily(req.user._id, {
            start,
            end
        });
        res.status(200).json(rows);
    } catch (e) {
        next(e);
    }
};

exports.getOverview = async (req, res, next) => {
    try {
        const { start, end } = req.query;
        const data = await intelligenceMetricsService.getOverview({ start, end });
        res.status(200).json(data);
    } catch (e) {
        next(e);
    }
};

exports.getSystemOverview = async (req, res, next) => {
    try {
        const data = await intelligenceMetricsService.getSystemOverview();
        res.status(200).json(data);
    } catch (e) {
        next(e);
    }
};

exports.getRevenueAnalytics = async (req, res, next) => {
    try {
        const { start, end } = req.query;
        const data = await intelligenceMetricsService.getRevenueAnalytics({ start, end });
        res.status(200).json(data);
    } catch (e) {
        next(e);
    }
};
