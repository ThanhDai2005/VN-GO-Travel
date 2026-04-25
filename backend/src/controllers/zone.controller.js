const zoneRepository = require('../repositories/zone.repository');
const accessControlService = require('../services/access-control.service');
const zoneService = require('../services/zone.service');
const { AppError } = require('../middlewares/error.middleware');
const { logEvent } = require('../utils/event-logger');

/**
 * Zone Controller
 * Handles zone/tour package endpoints
 */

class ZoneController {
    constructor() {
        this.getAllZones = this.getAllZones.bind(this);
        this.getZoneByCode = this.getZoneByCode.bind(this);
        this.scanZoneQr = this.scanZoneQr.bind(this);
        this.downloadZonePois = this.downloadZonePois.bind(this);
        this.checkZoneSync = this.checkZoneSync.bind(this);
    }

    /**
     * GET /api/v1/zones
     * Get all active zones
     */
    async getAllZones(req, res, next) {
        try {
            const zones = await zoneRepository.findAllActive();
            const userId = req.user ? req.user._id : null;

            // Add access status for each zone if user is authenticated
            const zonesWithAccess = await Promise.all(zones.map(async (zone) => {
                const zoneObj = zone.toObject();

                if (userId) {
                    const accessStatus = await accessControlService.canAccessZone(userId, zone.code);
                    zoneObj.accessStatus = accessStatus;
                }

                return zoneObj;
            }));

            res.json({
                success: true,
                data: zonesWithAccess
            });
        } catch (error) {
            console.error('[ZONE-CONTROLLER] Get all zones error:', error);
            next(error);
        }
    }

    /**
     * GET /api/v1/zones/:code
     * Get zone by code
     */
    async getZoneByCode(req, res, next) {
        try {
            const { code } = req.params;
            const userId = req.user ? req.user._id : null;

            const zone = await zoneRepository.findByCode(code);

            if (!zone) {
                throw new AppError('Zone not found', 404);
            }

            const zoneObj = zone.toObject();

            // Add access status if user is authenticated
            if (userId) {
                const accessStatus = await accessControlService.canAccessZone(userId, code);
                zoneObj.accessStatus = accessStatus;
            }

            res.json({
                success: true,
                data: zoneObj
            });
        } catch (error) {
            console.error('[ZONE-CONTROLLER] Get zone error:', error);
            next(error);
        }
    }

    /**
     * POST /api/v1/zones/scan
     * Scan zone QR code
     */
    async scanZoneQr(req, res, next) {
        const startTime = Date.now();
        try {
            const { token } = req.body;

            if (!token || typeof token !== 'string') {
                throw new AppError('token is required', 400);
            }

            const userId = req.user ? req.user._id : null;

            // Resolve zone scan token
            const result = await zoneService.resolveZoneScanToken(token, userId);

            // Log successful scan event
            await logEvent('ZONE_SCAN', {
                userId: userId ? userId.toString() : null,
                zoneCode: result.zone.code,
                zoneName: result.zone.name,
                hasAccess: result.accessStatus.hasAccess,
                ip: req.ip,
                userAgent: req.get('user-agent'),
                success: true,
                responseTime: Date.now() - startTime
            });

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            // Log failed scan event
            await logEvent('ZONE_SCAN', {
                userId: req.user ? req.user._id.toString() : null,
                zoneCode: null,
                ip: req.ip,
                userAgent: req.get('user-agent'),
                success: false,
                error: error.message,
                responseTime: Date.now() - startTime
            });

            console.error('[ZONE-CONTROLLER] Scan zone QR error:', error);
            next(error);
        }
    }

    /**
     * POST /api/v1/zones/:code/download
     * Download all POIs in zone (requires access)
     */
    async downloadZonePois(req, res, next) {
        const startTime = Date.now();
        try {
            const { code } = req.params;
            const { page, limit, cursor } = req.query;
            const userId = req.user ? req.user._id : null;

            if (!userId) {
                throw new AppError('Authentication required', 401);
            }

            const result = await zoneService.getZonePoisForDownload(code, userId, page, limit, cursor);

            // Log download event
            await logEvent('ZONE_DOWNLOAD', {
                userId: userId.toString(),
                zoneCode: code,
                zoneName: result.zoneName,
                poiCount: result.pois.length,
                page: result.pagination.page,
                totalPages: result.pagination.totalPages,
                cursor: cursor || null,
                ip: req.ip,
                userAgent: req.get('user-agent'),
                success: true,
                responseTime: Date.now() - startTime
            });

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            // Log failed download event
            await logEvent('ZONE_DOWNLOAD', {
                userId: req.user ? req.user._id.toString() : null,
                zoneCode: req.params.code,
                ip: req.ip,
                userAgent: req.get('user-agent'),
                success: false,
                error: error.message,
                responseTime: Date.now() - startTime
            });

            console.error('[ZONE-CONTROLLER] Download zone POIs error:', error);
            next(error);
        }
    }

    /**
     * GET /api/v1/zones/:code/check-sync
     * Check sync status for zone (offline-first support)
     */
    async checkZoneSync(req, res, next) {
        try {
            const { code } = req.params;
            const { lastSync, lastVersion } = req.query;
            const userId = req.user ? req.user._id : null;

            if (!userId) {
                throw new AppError('Authentication required', 401);
            }

            const result = await zoneService.checkZoneSync(code, userId, lastSync, lastVersion);

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[ZONE-CONTROLLER] Check zone sync error:', error);
            next(error);
        }
    }
}

module.exports = new ZoneController();
