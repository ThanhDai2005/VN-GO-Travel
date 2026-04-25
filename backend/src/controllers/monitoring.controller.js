const EventLogger = require('../services/event-logger.service');
const MetricsService = require('../services/metrics.service');
const User = require('../models/user.model');

/**
 * MONITORING CONTROLLER
 * Debug and observability endpoints for system monitoring
 */

exports.getCurrentMetrics = async (req, res, next) => {
    try {
        const metrics = MetricsService.getCurrentMetrics();

        res.status(200).json({
            success: true,
            data: metrics
        });
    } catch (error) {
        next(error);
    }
};

exports.getMetricsHistory = async (req, res, next) => {
    try {
        const history = MetricsService.getMetricsHistory();

        res.status(200).json({
            success: true,
            data: history
        });
    } catch (error) {
        next(error);
    }
};

exports.getMetricsSummary = async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;

        // Default to last 24 hours
        const start = startDate || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const end = endDate || new Date().toISOString();

        const summary = await MetricsService.getMetricsSummary(start, end);

        res.status(200).json({
            success: true,
            data: summary
        });
    } catch (error) {
        next(error);
    }
};

exports.getRecentEvents = async (req, res, next) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 100, 500);
        const filters = {
            eventType: req.query.eventType,
            userId: req.query.userId,
            status: req.query.status,
            startDate: req.query.startDate
        };

        const events = await EventLogger.getRecentEvents(limit, filters);

        res.status(200).json({
            success: true,
            count: events.length,
            data: events
        });
    } catch (error) {
        next(error);
    }
};

exports.getEventStats = async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;

        // Default to last 24 hours
        const start = startDate || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const end = endDate || new Date().toISOString();

        const stats = await EventLogger.getEventStats(start, end);

        res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error) {
        next(error);
    }
};

exports.getErrorSummary = async (req, res, next) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 10, 100);
        const errors = await EventLogger.getErrorSummary(limit);

        res.status(200).json({
            success: true,
            count: errors.length,
            data: errors
        });
    } catch (error) {
        next(error);
    }
};

exports.getSystemHealth = async (req, res, next) => {
    try {
        const health = MetricsService.isHealthy();

        res.status(200).json({
            success: true,
            data: health
        });
    } catch (error) {
        next(error);
    }
};

exports.getActiveUsers = async (req, res, next) => {
    try {
        // Users active in last 5 minutes
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

        const SystemEvent = require('../models/system-event.model');

        const activeUserIds = await SystemEvent.distinct('userId', {
            timestamp: { $gte: fiveMinutesAgo }
        });

        const activeUsers = await User.find({
            _id: { $in: activeUserIds }
        })
            .select('email fullName isPremium')
            .lean();

        res.status(200).json({
            success: true,
            count: activeUsers.length,
            data: activeUsers
        });
    } catch (error) {
        next(error);
    }
};
