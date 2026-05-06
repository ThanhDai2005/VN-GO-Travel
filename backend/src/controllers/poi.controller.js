const poiService = require('../services/poi.service');
const zoneService = require('../services/zone.service');

/**
 * POI Controller
 *
 * NOTE: scan() method uses Zone QR system for backward compatibility
 */

/**
 * Legacy POI scan endpoint - converts zone scan to POI format
 * POST /api/v1/pois/scan
 */
exports.scanLegacy = async (req, res, next) => {
    try {
        const { token } = req.body;

        if (!token || typeof token !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'token is required'
            });
        }

        const userId = req.user ? req.user._id : null;

        // Use zone service to resolve token
        const zoneResult = await zoneService.resolveZoneScanToken(token, userId);

        // Convert zone result to legacy POI format
        // Take the first POI from the zone
        if (!zoneResult.pois || zoneResult.pois.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No POIs found in this zone'
            });
        }

        const firstPoi = zoneResult.pois[0];

        // Map to legacy PoiScanData format
        const legacyData = {
            id: firstPoi._id || firstPoi.id,
            code: firstPoi.code,
            location: firstPoi.location,
            radius: firstPoi.radius || 50,
            priority: firstPoi.priority || 0,
            name: firstPoi.name,
            summary: firstPoi.summary,
            narrationShort: firstPoi.narrationShort,
            narrationLong: firstPoi.narrationLong,
            content: firstPoi.content,
            isPremiumOnly: firstPoi.isPremiumOnly || false,
            status: firstPoi.status
        };

        res.status(200).json({
            success: true,
            data: legacyData
        });
    } catch (error) {
        next(error);
    }
};

exports.getNearby = async (req, res, next) => {
    try {
        const { lat, lng, radius, limit, page, includeTranslations } = req.query;

        const pois = await poiService.getNearbyPois(lat, lng, radius, limit, page, {
            includeTranslations: includeTranslations === 'true'
        });

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
        const { lang, includeTranslations } = req.query;

        const userId = req.user ? req.user._id : null;
        const poi = await poiService.getPoiByCode(code, lang, userId, {
            includeTranslations: includeTranslations === 'true'
        });

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
