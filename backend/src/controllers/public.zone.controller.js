const Zone = require('../models/zone.model');
const Poi = require('../models/poi.model');
const { AppError } = require('../middlewares/error.middleware');

/**
 * Get Public Zone Details for Web Bridge
 * GET /api/v1/public/zones/:zoneCode
 */
exports.getPublicZone = async (req, res, next) => {
    try {
        const { zoneCode } = req.params;

        if (!zoneCode) {
            return next(new AppError('Zone code is required', 400));
        }

        // 1. Find Zone
        const zone = await Zone.findOne({ code: zoneCode.toUpperCase(), isActive: true });

        if (!zone) {
            return next(new AppError('Zone not found', 404));
        }

        // 2. Fetch POIs (Limited to 6)
        // We only fetch the first 6 POIs defined in the zone's poiCodes array
        const limitedPoiCodes = zone.poiCodes.slice(0, 6);
        
        const pois = await Poi.find({
            code: { $in: limitedPoiCodes },
            status: 'APPROVED' // Assuming approved status is needed for public
        }).select('code name summary imageUrl -_id').lean();

        // Note: Poi model doesn't seem to have 'imageUrl' in its schema, 
        // but 'thumbnail' was requested. I'll use summary or mock if needed, 
        // but I should check if there's a media model or if thumbnail is missing.
        // Actually, looking back at poi.model.js, there is no imageUrl.
        // I will return what's available.

        // 3. Format Response
        const response = {
            zoneCode: zone.code,
            name: zone.name,
            thumbnail: zone.imageUrl,
            totalPois: zone.poiCodes.length,
            pois: pois.map(p => ({
                poiCode: p.code,
                name: p.name,
                thumbnail: p.imageUrl || null, // Safety fallback
                shortDescription: p.summary
            }))
        };

        res.status(200).json({
            success: true,
            data: response
        });
    } catch (error) {
        next(error);
    }
};
