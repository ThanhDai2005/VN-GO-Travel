const poiService = require('../services/poi.service');

/**
 * POI Controller
 *
 * NOTE: scan() method REMOVED - POI QR system deprecated.
 * Use Zone QR system instead: POST /api/v1/zones/scan
 */

exports.getNearby = async (req, res, next) => {
    try {
        const { lat, lng, radius, limit, page } = req.query;

        const pois = await poiService.getNearbyPois(lat, lng, radius, limit, page);

        const verifiedLimit = Math.min(parseInt(limit) || 10, 50);
        const verifiedPage = Math.max(parseInt(page) || 1, 1);

        res.status(200).json({
            success: true,
            count: pois.length,
            pagination: {
                page: verifiedPage,
                limit: verifiedLimit
            },
            data: pois
        });
    } catch (error) {
        next(error);
    }
};

exports.getByCode = async (req, res, next) => {
    try {
        const { code } = req.params;
        const { lang } = req.query;

        const poi = await poiService.getPoiByCode(code, lang);

        res.status(200).json({
            success: true,
            data: poi
        });
    } catch (error) {
        next(error);
    }
};

exports.create = async (req, res, next) => {
    try {
        const poi = await poiService.createPoi(req.body);
        res.status(201).json({ success: true, data: poi });
    } catch (error) {
        next(error);
    }
};

exports.updateByCode = async (req, res, next) => {
    try {
        const { code } = req.params;
        const poi = await poiService.updatePoiByCode(code, req.body);
        res.status(200).json({ success: true, data: poi });
    } catch (error) {
        next(error);
    }
};

exports.deleteByCode = async (req, res, next) => {
    try {
        const { code } = req.params;
        const result = await poiService.deletePoiByCode(code);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

exports.checkSync = async (req, res, next) => {
    try {
        const { lastSyncTime } = req.query;

        const syncData = await poiService.checkContentSync(lastSyncTime);

        res.status(200).json({
            success: true,
            data: syncData
        });
    } catch (error) {
        next(error);
    }
};
