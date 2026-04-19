const intelligenceEventsService = require('../services/intelligence-events.service');

exports.postBatch = async (req, res, next) => {
    try {
        const headerDeviceId = req.headers['x-device-id'] || null;
        const result = await intelligenceEventsService.ingestBatch(req.body, req.user, {
            headerDeviceId
        });
        res.status(200).json(result);
    } catch (e) {
        next(e);
    }
};

exports.postSingle = async (req, res, next) => {
    try {
        const headerDeviceId = req.headers['x-device-id'] || null;
        const result = await intelligenceEventsService.ingestSingle(req.body, req.user, {
            headerDeviceId
        });
        res.status(200).json(result);
    } catch (e) {
        next(e);
    }
};

exports.getJourney = async (req, res, next) => {
    try {
        const { correlationId } = req.params;
        const limit = parseInt(req.query.limit, 10) || 500;
        const rows = await intelligenceEventsService.getJourneyByCorrelationId(correlationId, { limit });
        res.status(200).json({ success: true, data: { correlationId, events: rows } });
    } catch (e) {
        next(e);
    }
};

exports.getSummary = async (req, res, next) => {
    try {
        const { from, to } = req.query;
        const data = await intelligenceEventsService.getSummary({ from, to });
        res.status(200).json({ success: true, data });
    } catch (e) {
        next(e);
    }
};
