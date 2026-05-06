const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const zoneRepository = require('../repositories/zone.repository');
const poiRepository = require('../repositories/poi.repository');
const poiService = require('./poi.service');
const accessControlService = require('./access-control.service');
const RevokedToken = require('../models/revoked-token.model');
const ScanLog = require('../models/scan-log.model');
const { AppError } = require('../middlewares/error.middleware');
const { POI_STATUS } = require('../constants/poi-status');

/**
 * Generate UUID v4 without external dependency
 */
function generateUuid() {
    return crypto.randomUUID();
}

/**
 * Zone Service
 * Handles zone QR token generation and scanning
 */

class ZoneService {
    /**
     * Generate QR scan token for zone (Admin)
     * Returns JWT with expiration for printed QR codes
     */
    async generateZoneQrToken(zoneId) {
        try {
            const zone = await zoneRepository.findById(zoneId);

            if (!zone) {
                throw new AppError('Zone not found', 404);
            }

            if (!zone.isActive) {
                throw new AppError('Cannot generate QR for inactive zone', 400);
            }

            // Generate unique token ID (jti)
            const jti = generateUuid();

            // Calculate expiration
            const ttlHours = config.zoneQrTokenTtlHours;
            const expiresInSeconds = ttlHours * 60 * 60;
            const now = Math.floor(Date.now() / 1000);
            const exp = now + expiresInSeconds;

            // Create JWT payload
            const payload = {
                jti,
                zoneId: zone._id.toString(),
                zoneCode: zone.code,
                type: 'zone_qr',
                iat: now,
                exp
            };

            // Sign token
            const token = jwt.sign(payload, config.jwtSecret);

            // Build scan URL
            const scanUrl = `${config.scanQrUrlBase}?t=${token}`;

            return {
                token,
                scanUrl,
                jti,
                expiresAt: new Date(exp * 1000).toISOString(),
                ttlHours,
                zoneCode: zone.code,
                zoneName: zone.name
            };
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            console.error('[ZONE-SERVICE] Generate QR token error:', error);
            throw new AppError('Failed to generate zone QR token', 500);
        }
    }

    async resolveZoneScanToken(token, userId = null, requestInfo = {}) {
        const { ip, userAgent } = requestInfo;
        try {
            // 1. Verify JWT signature and expiration
            let decoded;
            try {
                decoded = jwt.verify(token, config.jwtSecret);
            } catch (err) {
                if (err.name === 'TokenExpiredError') {
                    // Record expired scan
                    const payload = jwt.decode(token);
                    if (payload && payload.zoneCode) {
                        await ScanLog.create({ 
                            zoneCode: payload.zoneCode, 
                            userId, ip, userAgent, 
                            status: 'EXPIRED',
                            error: 'Token expired'
                        });
                    }
                    throw new AppError('Zone QR code has expired. Please request a new QR code.', 401);
                }
                throw new AppError('Invalid zone QR token', 401);
            }

            // 2. Validate token type
            if (decoded.type !== 'zone_qr') {
                throw new AppError('Invalid token type', 400);
            }

            // 3. Check if token is blacklisted
            const { jti, zoneCode } = decoded;
            if (jti) {
                const isRevoked = await RevokedToken.isRevoked(jti);
                if (isRevoked) {
                    await ScanLog.create({ 
                        zoneCode, userId, ip, userAgent, 
                        status: 'REVOKED',
                        error: 'Token revoked'
                    });
                    throw new AppError('This QR code has been revoked. Please request a new QR code.', 401);
                }
            }

            // 4. Get zone
            const zone = await zoneRepository.findByCode(zoneCode);
            if (!zone) {
                throw new AppError('Zone not found', 404);
            }

            if (!zone.isActive) {
                throw new AppError('Zone is not available', 403);
            }

            // 5. Get all APPROVED POIs in zone
            const allPois = await poiRepository.findByCodes(zone.poiCodes);
            const approvedPois = allPois.filter(poi => poi.status === POI_STATUS.APPROVED);

            // 6. Check access status
            let accessStatus = {
                hasAccess: false,
                requiresPurchase: true,
                price: zone.price
            };

            if (userId) {
                const access = await accessControlService.canAccessZone(userId, zoneCode);
                accessStatus.hasAccess = access.allowed;
                accessStatus.requiresPurchase = !access.allowed;

                if (access.allowed) {
                    accessStatus.reason = access.reason;
                    accessStatus.message = access.message;
                }
            }

            const audioService = require('./audio.service');

            // 7. Filter POI content based on access (Distributed + Versioned Audio)
            const filteredPois = await Promise.all(approvedPois.map(async (poi) => {
                const poiObj = poiService.mapPoiDto(poi);
                const hasAccess = accessStatus.hasAccess;
                
                // Select content for audio based on access
                const textForAudio = (hasAccess && poi.narrationLong) ? poi.narrationLong : (poi.narrationShort || poi.name);
                const lang = poi.languageCode || 'vi';
                const version = poi.version || 1;

                try {
                    // Check audio readiness (Version-aware)
                    const audioStatus = await audioService.getAudioStatus(textForAudio, lang, 'female', version, poi.code);
                    
                    poiObj.audio = {
                        url: audioStatus.url,
                        ready: audioStatus.ready
                    };
                    poiObj.audioUrl = audioStatus.url; // Legacy support

                    // Trigger background generation if not ready (Production guard: catch errors)
                    if (!audioStatus.ready) {
                        audioService.generateAudioAsync({ 
                            text: textForAudio, 
                            language: lang, 
                            version, 
                            poiCode: poi.code,
                            zoneCode: zone.code
                        });
                    }
                } catch (audioErr) {
                    console.error(`[ZONE-SCAN] Audio status check failed for POI ${poi.code}:`, audioErr.message);
                    // Fallback: Don't break the scan if audio service is flaky
                    poiObj.audio = { ready: false };
                }

                // If no access, strictly sanitize premium content
                if (!hasAccess) {
                    poiObj.narrationLong = null;

                    // Also filter localizedContent
                    if (poiObj.localizedContent) {
                        Object.keys(poiObj.localizedContent).forEach(lang => {
                            if (poiObj.localizedContent[lang]) {
                                poiObj.localizedContent[lang].narrationLong = null;
                            }
                        });
                    }
                }

                return poiObj;
            }));

            // 8. Log successful scan
            await ScanLog.create({ 
                zoneCode, userId, ip, userAgent, 
                status: 'SUCCESS'
            });

            // 8. Return zone + POIs + access status
            return {
                zone: {
                    id: zone._id.toString(),
                    code: zone.code,
                    name: zone.name,
                    description: zone.description,
                    price: zone.price,
                    poiCount: approvedPois.length,
                    imageUrl: zone.imageUrl,
                    tags: zone.tags
                },
                pois: filteredPois,
                accessStatus
            };
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            console.error('[ZONE-SERVICE] Resolve scan token error:', error);
            throw new AppError('Failed to resolve zone scan token', 500);
        }
    }

    /**
     * Get POIs for zone download (authenticated users with access only)
     * Supports cursor-based pagination for resumable downloads
     */
    async getZonePoisForDownload(zoneCode, userId, page = 1, limit = 10, cursor = null) {
        try {
            if (!userId) {
                throw new AppError('Authentication required', 401);
            }

            // Validate pagination params
            const pageNum = Math.max(1, parseInt(page) || 1);
            const limitNum = Math.min(20, Math.max(1, parseInt(limit) || 10)); // Max 20 per page

            // 1. Get zone
            const zone = await zoneRepository.findByCode(zoneCode);
            if (!zone) {
                throw new AppError('Zone not found', 404);
            }

            // 2. Check access (CRITICAL: must have purchased or be premium)
            const access = await accessControlService.canAccessZone(userId, zoneCode);
            if (!access.allowed) {
                throw new AppError('Access denied. Purchase zone to download POIs.', 403);
            }

            // 3. Get all APPROVED POIs with full content
            const allPois = await poiRepository.findByCodes(zone.poiCodes);
            const approvedPois = allPois.filter(poi => poi.status === POI_STATUS.APPROVED);

            // 4. Sort by _id for stable ordering (deterministic pagination)
            approvedPois.sort((a, b) => {
                return a._id.toString().localeCompare(b._id.toString());
            });

            // 5. Apply cursor-based pagination if cursor provided
            let filteredPois = approvedPois;
            if (cursor) {
                const cursorIndex = approvedPois.findIndex(poi => poi._id.toString() === cursor);
                if (cursorIndex >= 0) {
                    filteredPois = approvedPois.slice(cursorIndex + 1);
                }
            }

            // 6. Paginate
            const totalPois = filteredPois.length;
            const totalPages = Math.ceil(totalPois / limitNum);
            const startIdx = (pageNum - 1) * limitNum;
            const endIdx = startIdx + limitNum;
            const paginatedPois = filteredPois.slice(startIdx, endIdx);

            const audioService = require('./audio.service');

            const poisWithAudio = await Promise.all(paginatedPois.map(async (poi) => {
                const poiObj = poiService.mapPoiDto(poi);
                const text = poi.narrationLong || poi.narrationShort || poi.name;
                const lang = poi.languageCode || 'vi';
                const version = poi.version || 1;

                // Check audio readiness (Version-aware)
                const audioStatus = await audioService.getAudioStatus(text, lang, 'female', version, poi.code);
                
                poiObj.audio = {
                    url: audioStatus.url,
                    ready: audioStatus.ready
                };
                poiObj.audioUrl = audioStatus.url; // Legacy support
                poiObj.narrationAudioUrl = audioStatus.url;

                // Trigger background generation if not ready
                if (!audioStatus.ready) {
                    audioService.generateAudioAsync({ 
                        text, 
                        language: lang, 
                        version, 
                        poiCode: poi.code,
                        zoneCode: zone.code
                    });
                }

                return poiObj;
            }));

            // 8. Generate next cursor (last POI's _id in current page)
            const nextCursor = paginatedPois.length > 0
                ? paginatedPois[paginatedPois.length - 1]._id.toString()
                : null;

            return {
                pois: poisWithAudio,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: totalPois,
                    totalPages,
                    hasNext: pageNum < totalPages,
                    hasPrev: pageNum > 1,
                    nextCursor: pageNum < totalPages ? nextCursor : null
                },
                zoneCode: zone.code,
                zoneName: zone.name
            };
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            console.error('[ZONE-SERVICE] Get zone POIs error:', error);
            throw new AppError('Failed to get zone POIs', 500);
        }
    }

    /**
     * Check sync status for zone (offline-first support)
     * Returns only POIs that changed since lastSync timestamp OR version
     * FIX: Now returns current POI codes for client-side sync
     */
    async checkZoneSync(zoneCode, userId, lastSyncTimestamp, lastSyncVersion) {
        try {
            if (!userId) {
                throw new AppError('Authentication required', 401);
            }

            // 1. Get zone
            const zone = await zoneRepository.findByCode(zoneCode);
            if (!zone) {
                throw new AppError('Zone not found', 404);
            }

            // 2. Check access
            const access = await accessControlService.canAccessZone(userId, zoneCode);
            if (!access.allowed) {
                throw new AppError('Access denied', 403);
            }

            // 3. Parse lastSync timestamp and version
            const lastSync = lastSyncTimestamp ? new Date(lastSyncTimestamp) : new Date(0);
            const lastVersion = lastSyncVersion ? parseInt(lastSyncVersion) : 0;

            // 4. Get all APPROVED POIs
            const allPois = await poiRepository.findByCodes(zone.poiCodes);
            const approvedPois = allPois.filter(poi => poi.status === POI_STATUS.APPROVED);

            // FIX: Extract current POI codes for sync
            const currentPoiCodes = approvedPois.map(poi => poi.code);

            // 5. Filter updated POIs (version > lastVersion OR updatedAt > lastSync)
            const updatedPois = approvedPois.filter(poi => {
                // If this is the first sync (lastVersion = 0), return all POIs
                if (!lastVersion || lastVersion === 0) {
                    return true;
                }

                // For subsequent syncs, only return POIs that have been updated
                const versionChanged = poi.version && poi.version > lastVersion;
                const timestampChanged = poi.updatedAt && new Date(poi.updatedAt) > lastSync;
                return versionChanged || timestampChanged;
            });

            // 6. Detect deleted POIs (POIs that were in zone but now removed or not approved)
            // Note: This requires tracking previous zone state, simplified here
            const deletedPois = []; // TODO: Implement proper deletion tracking

            // 7. Calculate max version in current dataset
            const maxVersion = approvedPois.reduce((max, poi) => {
                return Math.max(max, poi.version || 0);
            }, 0);

            return {
                zoneCode: zone.code,
                lastSync: lastSync.toISOString(),
                lastVersion: lastVersion,
                currentTime: new Date().toISOString(),
                currentVersion: maxVersion,
                currentPoiCodes, // FIX: Added for client-side sync
                updatedPois: updatedPois.map(poi => poiService.mapPoiDto(poi)),
                deletedPois,
                hasChanges: updatedPois.length > 0 || deletedPois.length > 0
            };
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            console.error('[ZONE-SERVICE] Check sync error:', error);
            throw new AppError('Failed to check zone sync', 500);
        }
    }

    /**
     * Revoke zone QR token (Admin only)
     */
    async revokeZoneQrToken(jti, zoneId, adminUserId, reason) {
        try {
            const zone = await zoneRepository.findById(zoneId);
            if (!zone) {
                throw new AppError('Zone not found', 404);
            }

            // Calculate expiration (tokens auto-delete after they would have expired)
            const ttlHours = config.zoneQrTokenTtlHours;
            const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

            await RevokedToken.revokeToken(
                jti,
                zoneId,
                zone.code,
                adminUserId,
                expiresAt,
                reason
            );

            return {
                success: true,
                message: 'QR token revoked successfully',
                jti,
                zoneCode: zone.code
            };
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            console.error('[ZONE-SERVICE] Revoke token error:', error);
            throw new AppError('Failed to revoke QR token', 500);
        }
    }
}

module.exports = new ZoneService();
