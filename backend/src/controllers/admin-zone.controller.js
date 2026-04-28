const zoneService = require('../services/zone.service');
const zoneRepository = require('../repositories/zone.repository');
const { AppError } = require('../middlewares/error.middleware');
const { logEvent } = require('../utils/event-logger');

/**
 * Admin Zone Controller
 * Admin-only zone management endpoints
 */

class AdminZoneController {
    constructor() {
        this.getAllZones = this.getAllZones.bind(this);
        this.createZone = this.createZone.bind(this);
        this.updateZone = this.updateZone.bind(this);
        this.deleteZone = this.deleteZone.bind(this);
        this.updateZonePois = this.updateZonePois.bind(this);
        this.getZoneQrToken = this.getZoneQrToken.bind(this);
        this.revokeZoneQrToken = this.revokeZoneQrToken.bind(this);
    }

    /**
     * GET /api/v1/admin/zones
     * Get all zones (including inactive)
     */
    async getAllZones(req, res, next) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;

            const zones = await zoneRepository.findAll(page, limit);

            res.json({
                success: true,
                data: zones.data,
                pagination: zones.pagination
            });
        } catch (error) {
            console.error('[ADMIN-ZONE-CONTROLLER] Get all zones error:', error);
            next(error);
        }
    }

    /**
     * POST /api/v1/admin/zones
     * Create new zone
     */
    async createZone(req, res, next) {
        try {
            const { name, description, price, code } = req.body;

            if (!name || !price) {
                throw new AppError('name and price are required', 400);
            }

            // Generate code if missing
            const zoneCode = code || name.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');

            const zone = await zoneRepository.create({
                code: zoneCode,
                name,
                description: description || '',
                price: Number(price)
            });

            res.status(201).json({
                success: true,
                data: zone
            });
        } catch (error) {
            console.error('[ADMIN-ZONE-CONTROLLER] Create zone error:', error);
            next(error);
        }
    }

    /**
     * PUT /api/v1/admin/zones/:id
     * Update zone
     */
    async updateZone(req, res, next) {
        try {
            const { id } = req.params;
            const { name, description, price } = req.body;

            const updates = {};
            if (name !== undefined) updates.name = name;
            if (description !== undefined) updates.description = description;
            if (price !== undefined) updates.price = Number(price);

            const zone = await zoneRepository.updateById(id, updates);

            if (!zone) {
                throw new AppError('Zone not found', 404);
            }

            res.json({
                success: true,
                data: zone
            });
        } catch (error) {
            console.error('[ADMIN-ZONE-CONTROLLER] Update zone error:', error);
            next(error);
        }
    }

    /**
     * DELETE /api/v1/admin/zones/:id
     * Delete zone
     */
    async deleteZone(req, res, next) {
        try {
            const { id } = req.params;

            const deleted = await zoneRepository.deleteById(id);

            if (!deleted) {
                throw new AppError('Zone not found', 404);
            }

            res.json({
                success: true,
                message: 'Zone deleted successfully'
            });
        } catch (error) {
            console.error('[ADMIN-ZONE-CONTROLLER] Delete zone error:', error);
            next(error);
        }
    }

    /**
     * PUT /api/v1/admin/zones/:id/pois
     * Update POIs assigned to zone
     */
    async updateZonePois(req, res, next) {
        try {
            const { id } = req.params;
            const { poiIds } = req.body;

            console.log('UPDATE ZONE POIS:', poiIds);

            if (!Array.isArray(poiIds)) {
                throw new AppError('poiIds must be an array', 400);
            }

            // Convert POI IDs/Codes to POI codes
            const Poi = require('../models/poi.model');
            // Try finding by _id first, then fallback to code
            const pois = await Poi.find({ 
                $or: [
                    { _id: { $in: poiIds.filter(id => id.match(/^[0-9a-fA-F]{24}$/)) } },
                    { code: { $in: poiIds } }
                ]
            }).select('code');
            
            const poiCodes = pois.map(p => p.code);

            console.log('Final POI codes to save:', poiCodes);

            const zone = await zoneRepository.updatePois(id, poiCodes);

            if (!zone) {
                throw new AppError('Zone not found', 404);
            }

            const reloadedZone = await zoneRepository.findById(id);

            res.json({
                success: true,
                data: reloadedZone || zone
            });
        } catch (error) {
            console.error('[ADMIN-ZONE-CONTROLLER] Update zone POIs error:', error);
            next(error);
        }
    }

    /**
     * GET /api/v1/admin/zones/:id/qr-token
     * Generate QR token for zone
     */
    async getZoneQrToken(req, res, next) {
        try {
            const { id } = req.params;
            const adminUserId = req.user ? req.user._id : null;

            const result = await zoneService.generateZoneQrToken(id);

            // Log QR token generation event
            await logEvent('QR_TOKEN_GENERATED', {
                adminId: adminUserId ? adminUserId.toString() : null,
                zoneId: id,
                zoneCode: result.zoneCode,
                zoneName: result.zoneName,
                jti: result.jti,
                expiresAt: result.expiresAt,
                ip: req.ip,
                success: true
            });

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[ADMIN-ZONE-CONTROLLER] Get QR token error:', error);
            next(error);
        }
    }

    /**
     * POST /api/v1/admin/zones/:id/revoke-qr
     * Revoke zone QR token
     */
    async revokeZoneQrToken(req, res, next) {
        try {
            const { id } = req.params;
            const { jti, reason } = req.body;
            const adminUserId = req.user ? req.user._id : null;

            if (!jti) {
                throw new AppError('jti is required', 400);
            }

            const result = await zoneService.revokeZoneQrToken(jti, id, adminUserId, reason);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[ADMIN-ZONE-CONTROLLER] Revoke QR token error:', error);
            next(error);
        }
    }
}

module.exports = new AdminZoneController();
