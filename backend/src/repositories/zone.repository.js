const Zone = require('../models/zone.model');
const ZonePoi = require('../models/zone-poi.model');
const { AppError } = require('../middlewares/error.middleware');

/**
 * Zone Repository
 * Handles zone and zone-POI mapping operations
 */

class ZoneRepository {
    /**
     * Find zone by ID
     * Used by QR token generation
     */
    async findById(id) {
        const zone = await Zone.findById(id);
        return zone;
    }

    /**
     * Find all zones (including inactive) with pagination
     * Used by admin panel
     */
    async findAll(page = 1, limit = 50) {
        const skip = (page - 1) * limit;
        const zones = await Zone.find({})
            .sort({ displayOrder: 1, createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Zone.countDocuments({});

        return {
            data: zones,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        };
    }

    /**
     * Update zone POIs
     * Used by admin panel
     */
    async updatePois(id, poiCodes) {
        const zone = await Zone.findById(id);

        if (!zone) {
            throw new AppError('Zone not found', 404);
        }

        zone.poiCodes = poiCodes.map(code => code.toUpperCase());
        await zone.save();

        console.log(`[ZONE] Updated POIs for zone: ${zone.code}`);

        return zone;
    }

    /**
     * Find zone by code
     */
    async findByCode(code) {
        const zone = await Zone.findOne({ code: code.toUpperCase() });
        return zone;
    }

    /**
     * Find all active zones
     */
    async findAllActive() {
        const zones = await Zone.findActive();
        return zones;
    }

    /**
     * Get POI codes for zone
     */
    async getPoiCodesForZone(zoneCode) {
        const zone = await this.findByCode(zoneCode);

        if (!zone) {
            throw new AppError('Zone not found', 404);
        }

        // Return denormalized poiCodes for quick access
        return zone.poiCodes || [];
    }

    /**
     * Find zones containing POI
     */
    async findZonesContainingPoi(poiCode) {
        const zones = await Zone.findZonesContainingPoi(poiCode.toUpperCase());
        return zones;
    }

    /**
     * Create zone
     */
    async create(data) {
        const zone = await Zone.create({
            code: data.code.toUpperCase(),
            name: data.name,
            description: data.description || '',
            price: data.price,
            isActive: data.isActive !== undefined ? data.isActive : true,
            poiCodes: data.poiCodes || [],
            imageUrl: data.imageUrl || null,
            displayOrder: data.displayOrder || 0,
            tags: data.tags || []
        });

        console.log(`[ZONE] Created zone: ${zone.code}`);

        return zone;
    }

    /**
     * Update zone
     */
    async update(code, data) {
        const zone = await this.findByCode(code);

        if (!zone) {
            throw new AppError('Zone not found', 404);
        }

        if (data.name) zone.name = data.name;
        if (data.description !== undefined) zone.description = data.description;
        if (data.price !== undefined) zone.price = data.price;
        if (data.isActive !== undefined) zone.isActive = data.isActive;
        if (data.poiCodes) zone.poiCodes = data.poiCodes;
        if (data.imageUrl !== undefined) zone.imageUrl = data.imageUrl;
        if (data.displayOrder !== undefined) zone.displayOrder = data.displayOrder;
        if (data.tags) zone.tags = data.tags;

        await zone.save();

        console.log(`[ZONE] Updated zone: ${zone.code}`);

        return zone;
    }

    /**
     * Add POI to zone
     */
    async addPoiToZone(zoneCode, poiCode) {
        const zone = await this.findByCode(zoneCode);

        if (!zone) {
            throw new AppError('Zone not found', 404);
        }

        await zone.addPoi(poiCode.toUpperCase());

        console.log(`[ZONE] Added POI ${poiCode} to zone ${zoneCode}`);

        return zone;
    }

    /**
     * Remove POI from zone
     */
    async removePoiFromZone(zoneCode, poiCode) {
        const zone = await this.findByCode(zoneCode);

        if (!zone) {
            throw new AppError('Zone not found', 404);
        }

        await zone.removePoi(poiCode.toUpperCase());

        console.log(`[ZONE] Removed POI ${poiCode} from zone ${zoneCode}`);

        return zone;
    }

    /**
     * Delete zone
     */
    async delete(code) {
        const zone = await this.findByCode(code);

        if (!zone) {
            throw new AppError('Zone not found', 404);
        }

        await Zone.deleteOne({ code: code.toUpperCase() });

        console.log(`[ZONE] Deleted zone: ${code}`);

        return { success: true };
    }
}

module.exports = new ZoneRepository();
