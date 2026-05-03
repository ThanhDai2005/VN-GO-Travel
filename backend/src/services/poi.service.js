const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const poiRepository = require('../repositories/poi.repository');
const adminPoiAuditService = require('./admin-poi-audit.service');
const AdminPoiAudit = require('../models/admin-poi-audit.model');
const { AppError } = require('../middlewares/error.middleware');
const Cache = require('../utils/cache');
const config = require('../config');
const { POI_STATUS } = require('../constants/poi-status');
const userRepository = require('../repositories/user.repository');
const PoiChangeRequest = require('../models/poi-change-request.model');
const Poi = require('../models/poi.model');
const Zone = require('../models/zone.model');
const poiContentService = require('./poi-content.service');
const zoneRepository = require('../repositories/zone.repository');
const accessControlService = require('./access-control.service');
const { getClientIP } = require('../utils/ip-helper');

const poiCache = new Cache(config.cache.ttl);
const ownerPoiSubmissionCache = new Cache(10);

setInterval(() => poiCache.cleanup(), 3600000);
setInterval(() => ownerPoiSubmissionCache.cleanup(), 60000);

class PoiService {
    static USER_QR_SCAN_LIMIT = 20;
    _extractViContent(poi) {
        const fallbackFromLegacy = (() => {
            const legacyVi = poi?.content?.vi;
            if (!legacyVi) return {};
            if (typeof legacyVi === 'string') {
                const text = legacyVi.trim();
                return { name: text, summary: '', narrationShort: '', narrationLong: text };
            }
            return {
                name: String(legacyVi.name || '').trim(),
                summary: String(legacyVi.summary || '').trim(),
                narrationShort: String(legacyVi.narrationShort || '').trim(),
                narrationLong: String(legacyVi.narrationLong || '').trim()
            };
        })();

        return {
            name: String(poi?.name || fallbackFromLegacy.name || '').trim(),
            summary: String(poi?.summary || fallbackFromLegacy.summary || '').trim(),
            narrationShort: String(poi?.narrationShort || fallbackFromLegacy.narrationShort || '').trim(),
            narrationLong: String(poi?.narrationLong || fallbackFromLegacy.narrationLong || '').trim()
        };
    }

    _toLocaleContent(input) {
        if (!input) return { name: '', summary: '', narrationShort: '', narrationLong: '' };
        if (typeof input === 'string') {
            const text = input.trim();
            return { name: text, summary: text, narrationShort: text, narrationLong: text };
        }
        if (typeof input !== 'object') return { name: '', summary: '', narrationShort: '', narrationLong: '' };

        return {
            name: String(input.name || '').trim(),
            summary: String(input.summary || '').trim(),
            narrationShort: String(input.narrationShort || '').trim(),
            narrationLong: String(input.narrationLong || '').trim()
        };
    }

    _normalizeContentInput(content, { fallbackViName = '' } = {}) {
        const safe = content && typeof content === 'object' ? content : {};
        const vi = this._toLocaleContent(safe.vi);
        if (!vi.name && fallbackViName) vi.name = fallbackViName;
        return { vi };
    }

    _pickDisplayText(localeContent) {
        if (!localeContent || typeof localeContent !== 'object') return '';
        return (
            localeContent.narrationShort ||
            localeContent.narrationLong ||
            localeContent.summary ||
            localeContent.name ||
            ''
        );
    }

    _legacyContentByLang(content) {
        const viObj = this._toLocaleContent(content?.vi);
        return {
            vi: this._pickDisplayText(viObj),
            en: ''
        };
    }

    // Helper to format/map DTO
    mapPoiDto(poi, lang) {
        const viContent = this._extractViContent(poi);
        const normalizedContent = { vi: viContent };
        const legacyByLang = { vi: this._pickDisplayText(viContent), en: '' };

        return {
            id: poi._id,
            code: poi.code,
            location: {
                lat: poi.location.coordinates[1],
                lng: poi.location.coordinates[0]
            },
            radius: Number(poi.radius || 100),
            priority: Number(poi.priority || 0),
            languageCode: String(poi.languageCode || 'vi').toLowerCase(),
            name: viContent.name,
            summary: viContent.summary,
            narrationShort: viContent.narrationShort,
            narrationLong: viContent.narrationLong,
            content: this._pickDisplayText(viContent),
            contentByLang: legacyByLang,
            localizedContent: normalizedContent,
            isPremiumOnly: poi.isPremiumOnly,
            zoneCode: poi.zoneCode || null,
            zoneName: poi.zoneName || null,
            accessStatus: poi.accessStatus || null
        };
    }

    async getNearbyPois(lat, lng, radius, limit, page = 1) {
        // Validation
        if (!lat || !lng) {
            throw new AppError('Latitude and Longitude are required', 400);
        }

        if ((typeof lat !== 'string' && typeof lat !== 'number') || 
            (typeof lng !== 'string' && typeof lng !== 'number')) {
            throw new AppError('Invalid input type for coordinates', 400);
        }

        if (isNaN(Number(lat)) || isNaN(Number(lng))) {
            throw new AppError('Latitude and Longitude must be valid numbers', 400);
        }

        // Pagination validation
        const verifiedLimit = Math.min(parseInt(limit) || 10, 50);
        const verifiedPage = Math.max(parseInt(page) || 1, 1);

        // Cache lookup
        const cacheKey = `nearby:${lat}:${lng}:${radius}:${verifiedLimit}:${verifiedPage}`;
        const cachedData = poiCache.get(cacheKey);
        if (cachedData) {
            console.log(`[CACHE] Hit: ${cacheKey}`);
            return cachedData;
        }

        const pois = await poiRepository.findNearby(lng, lat, radius, verifiedLimit, verifiedPage);
        const mappedPois = pois.map((poi) => {
            const base = this.mapPoiDto(poi, 'en');
            return {
                ...base,
                contentByLang: base.contentByLang
            };
        });

        // Store in cache
        poiCache.set(cacheKey, mappedPois);
        
        return mappedPois;
    }

    async getPoiByCode(code, lang = 'en', userId = null) {
        // Don't cache if personalized (userId provided)
        const cacheKey = `poi:${code}:${lang}`;
        if (!userId) {
            const cachedPoi = poiCache.get(cacheKey);
            if (cachedPoi) {
                console.log(`[CACHE] Hit: ${cacheKey}`);
                return cachedPoi;
            }
        }

        const poi = await poiRepository.findByCode(code, { publicOnly: true });

        if (!poi) {
            throw new AppError('POI not found', 404);
        }

        // Find zone containing this POI
        const zones = await zoneRepository.findZonesContainingPoi(code);
        if (zones && zones.length > 0) {
            poi.zoneCode = zones[0].code;
            poi.zoneName = zones[0].name;
        }

        // Check access status if userId is provided
        if (userId) {
            poi.accessStatus = await accessControlService.canAccessPoi(userId, code);
        }

        const result = this.mapPoiDto(poi, lang);
        
        // Store in cache only if not personalized
        if (!userId) {
            poiCache.set(cacheKey, result);
        }

        return result;
    }

    _invalidateCache() {
        poiCache.clear();
    }

    _buildLocationPayload(body) {
        const { lat, lng } = body.location || {};
        if (lat === undefined || lng === undefined) {
            throw new AppError('location.lat and location.lng are required', 400);
        }
        if ((typeof lat !== 'string' && typeof lat !== 'number') ||
            (typeof lng !== 'string' && typeof lng !== 'number')) {
            throw new AppError('Invalid input type for coordinates', 400);
        }
        if (isNaN(Number(lat)) || isNaN(Number(lng))) {
            throw new AppError('Latitude and Longitude must be valid numbers', 400);
        }
        return {
            type: 'Point',
            coordinates: [Number(lng), Number(lat)]
        };
    }

    async createPoi(body) {
        if (!body || typeof body.code !== 'string' || !body.code.trim()) {
            throw new AppError('POI code is required', 400);
        }
        const location = this._buildLocationPayload(body);
        const doc = {
            code: body.code.trim(),
            location,
            radius: body.radius !== undefined ? Number(body.radius) : 100,
            priority: body.priority !== undefined ? Number(body.priority) : 0,
            languageCode: String(body.languageCode || 'vi').toLowerCase(),
            name: String(body.name || '').trim(),
            summary: String(body.summary || '').trim(),
            narrationShort: String(body.narrationShort || '').trim(),
            narrationLong: String(body.narrationLong || '').trim(),
            isPremiumOnly: Boolean(body.isPremiumOnly),
            status: POI_STATUS.APPROVED,
            submittedBy: null
        };
        if (!doc.name) {
            throw new AppError('Name is required', 400);
        }
        const poi = await poiRepository.create(doc);

        // PHASE 2B: Dual-write to poi_contents
        try {
            await poiContentService.createContent({
                poiCode: poi.code,
                language: doc.languageCode,
                title: doc.name,
                description: doc.summary,
                narrationShort: doc.narrationShort,
                narrationLong: doc.narrationLong,
                version: 1
            });
        } catch (error) {
            console.error('[DUAL-WRITE] Failed to create poi_content:', error);
        }

        this._invalidateCache();
        return this.mapPoiDto(poi, 'en');
    }

    async updatePoiByCode(code, body) {
        if (!code) {
            throw new AppError('POI code is required', 400);
        }
        const existing = await poiRepository.findByCode(code);
        if (!existing) {
            throw new AppError('POI not found', 404);
        }
        const update = {};
        if (body.location) {
            update.location = this._buildLocationPayload(body);
        }
        if (body.radius !== undefined) {
            update.radius = Number(body.radius);
        }
        if (body.priority !== undefined) {
            update.priority = Number(body.priority);
        }
        if (body.languageCode !== undefined) {
            update.languageCode = String(body.languageCode || 'vi').toLowerCase();
        }
        if (body.name !== undefined) {
            update.name = String(body.name || '').trim();
        }
        if (body.summary !== undefined) {
            update.summary = String(body.summary || '').trim();
        }
        if (body.narrationShort !== undefined) {
            update.narrationShort = String(body.narrationShort || '').trim();
        }
        if (body.narrationLong !== undefined) {
            update.narrationLong = String(body.narrationLong || '').trim();
        }
        if (body.isPremiumOnly !== undefined) {
            update.isPremiumOnly = Boolean(body.isPremiumOnly);
        }
        const poi = await poiRepository.updateByCode(code, update);

        // PHASE 2B: Dual-write to poi_contents
        try {
            const contentUpdate = {};
            if (body.name !== undefined) contentUpdate.title = update.name;
            if (body.summary !== undefined) contentUpdate.description = update.summary;
            if (body.narrationShort !== undefined) contentUpdate.narrationShort = update.narrationShort;
            if (body.narrationLong !== undefined) contentUpdate.narrationLong = update.narrationLong;

            if (Object.keys(contentUpdate).length > 0) {
                const language = update.languageCode || existing.languageCode || 'vi';
                const contentExists = await poiContentService.contentExists(code, language);

                if (contentExists) {
                    await poiContentService.updateContent(code, language, contentUpdate);
                } else {
                    // Create if doesn't exist
                    await poiContentService.createContent({
                        poiCode: code,
                        language,
                        title: update.name || existing.name,
                        description: update.summary || existing.summary || '',
                        narrationShort: update.narrationShort || existing.narrationShort || '',
                        narrationLong: update.narrationLong || existing.narrationLong || '',
                        version: 1
                    });
                }
            }
        } catch (error) {
            console.error('[DUAL-WRITE] Failed to update poi_content:', error);
        }

        this._invalidateCache();
        return this.mapPoiDto(poi, 'en');
    }

    async deletePoiByCode(code) {
        if (!code) {
            throw new AppError('POI code is required', 400);
        }
        const deleted = await poiRepository.deleteByCode(code);
        if (!deleted) {
            throw new AppError('POI not found', 404);
        }
        this._invalidateCache();
        return { code: deleted.code };
    }

    validatePoiInput(body, { mode = 'owner' } = {}) {
        if (!body || typeof body !== 'object') {
            throw new AppError('Request body is required', 400);
        }
        const raw = { ...body };
        delete raw.status;

        if (mode !== 'owner') {
            throw new AppError('Unsupported validation mode', 500);
        }

        if (typeof raw.code !== 'string' || !raw.code.trim()) {
            throw new AppError('POI code is required', 400);
        }

        if (typeof raw.name !== 'string' || !raw.name.trim()) {
            throw new AppError('Name is required', 400);
        }

        if (raw.radius === undefined || raw.radius === null || raw.radius === '') {
            throw new AppError('Radius is required', 400);
        }
        const radius = Number(raw.radius);
        if (Number.isNaN(radius) || radius < 1 || radius > 100000) {
            throw new AppError('Radius must be a valid number between 1 and 100000 meters', 400);
        }

        const location = this._buildLocationPayload(raw);

        return {
            code: raw.code.trim(),
            location,
            languageCode: 'vi',
            name: raw.name.trim(),
            summary: String(raw.summary || '').trim(),
            narrationShort: String(raw.narrationShort || '').trim(),
            narrationLong: String(raw.narrationLong || '').trim(),
            radius,
            priority: raw.priority !== undefined ? Number(raw.priority) : 0
        };
    }

    checkDuplicateSubmission(ownerId, code) {
        const key = `ownerSubmit:${String(ownerId)}:${code}`;
        if (ownerPoiSubmissionCache.get(key)) {
            throw new AppError('Please wait before submitting the same POI code again', 429);
        }
    }

    _mapOwnerSubmittedPoi(poi) {
        const viContent = this._extractViContent(poi);
        const contentByLang = { vi: this._pickDisplayText(viContent), en: '' };
        return {
            id: poi._id,
            code: poi.code,
            name: viContent.name,
            status: poi.status,
            ownerId: poi.submittedBy,
            location: {
                lat: poi.location.coordinates[1],
                lng: poi.location.coordinates[0]
            },
            radius: Number(poi.radius || 100),
            priority: Number(poi.priority || 0),
            languageCode: String(poi.languageCode || 'vi').toLowerCase(),
            summary: viContent.summary,
            narrationShort: viContent.narrationShort,
            narrationLong: viContent.narrationLong,
            content: contentByLang,
            localizedContent: { vi: viContent },
            isPremiumOnly: poi.isPremiumOnly,
            createdAt: poi.createdAt,
            updatedAt: poi.updatedAt
        };
    }

    _formatSubmittedBy(sb) {
        if (sb == null) return null;
        if (typeof sb === 'object' && sb.email) {
            return { id: String(sb._id), email: sb.email };
        }
        return String(sb);
    }

    _mapModerationDto(poi) {
        const viContent = this._extractViContent(poi);
        const contentByLang = { vi: this._pickDisplayText(viContent), en: '' };
        return {
            id: poi._id,
            code: poi.code,
            status: poi.status ?? null,
            rejectionReason: poi.rejectionReason ?? null,
            submittedBy: this._formatSubmittedBy(poi.submittedBy),
            location: {
                lat: poi.location.coordinates[1],
                lng: poi.location.coordinates[0]
            },
            radius: Number(poi.radius || 100),
            priority: Number(poi.priority || 0),
            languageCode: String(poi.languageCode || 'vi').toLowerCase(),
            name: viContent.name,
            summary: viContent.summary,
            narrationShort: viContent.narrationShort,
            narrationLong: viContent.narrationLong,
            content: contentByLang,
            localizedContent: { vi: viContent },
            isPremiumOnly: poi.isPremiumOnly,
            createdAt: poi.createdAt,
            updatedAt: poi.updatedAt
        };
    }

    async listPendingPoisForAdmin(query = {}) {
        const page = Math.max(parseInt(query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 100);
        const skip = (page - 1) * limit;

        const [pois, total] = await Promise.all([
            poiRepository.findPending({ limit, skip }),
            poiRepository.countPending()
        ]);

        const totalPages = Math.ceil(total / limit) || 0;

        return {
            items: pois.map((p) => this._mapModerationDto(p)),
            pagination: {
                page,
                limit,
                total,
                totalPages
            }
        };
    }

    /** Paginated list of all POIs (any status) for admin master CRUD UI. */
    async listMasterPoisForAdmin(query = {}) {
        const page = Math.max(parseInt(query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 100);
        const skip = (page - 1) * limit;

        const [pois, total] = await Promise.all([
            poiRepository.findAllForAdmin({ limit, skip }),
            poiRepository.countAll()
        ]);

        const totalPages = Math.ceil(total / limit) || 0;

        return {
            items: pois.map((p) => this._mapModerationDto(p)),
            pagination: {
                page,
                limit,
                total,
                totalPages
            }
        };
    }

    async approvePoiById(rawId, adminUser) {
        if (!rawId || typeof rawId !== 'string') {
            throw new AppError('POI id is required', 400);
        }
        if (!poiRepository.isValidObjectId(rawId)) {
            throw new AppError('Invalid POI id', 400);
        }

        const poi = await poiRepository.findById(rawId);
        if (!poi) {
            throw new AppError('POI not found', 404);
        }

        const status = poi.status;

        if (status === POI_STATUS.REJECTED) {
            throw new AppError('Cannot approve a rejected POI', 409);
        }

        if (status === POI_STATUS.APPROVED || status === undefined || status === null) {
            return this._mapModerationDto(poi);
        }

        if (status !== POI_STATUS.PENDING) {
            throw new AppError('POI cannot be approved from its current state', 409);
        }

        const session = await mongoose.startSession();
        try {
            let result;
            await session.withTransaction(async () => {
                let updated = await poiRepository.transitionPendingToApproved(rawId, { session });
                if (!updated) {
                    const latest = await poiRepository.findById(rawId);
                    if (latest && latest.status === POI_STATUS.APPROVED) {
                        result = latest;
                        return;
                    }
                    throw new AppError('POI could not be approved', 409);
                }

                await adminPoiAuditService.recordModeration({
                    adminId: adminUser._id,
                    poiId: updated._id,
                    action: AdminPoiAudit.ACTION.APPROVE,
                    previousStatus: POI_STATUS.PENDING,
                    newStatus: POI_STATUS.APPROVED,
                    reason: null,
                    session
                });
                result = updated;
            });

            this._invalidateCache();
            return this._mapModerationDto(result);
        } finally {
            session.endSession();
        }
    }

    async rejectPoiById(rawId, body, adminUser) {
        if (!rawId || typeof rawId !== 'string') {
            throw new AppError('POI id is required', 400);
        }
        if (!poiRepository.isValidObjectId(rawId)) {
            throw new AppError('Invalid POI id', 400);
        }

        const reason = body && typeof body.reason === 'string' ? body.reason.trim() : '';
        if (!reason) {
            throw new AppError('Rejection reason is required', 400);
        }

        const poi = await poiRepository.findById(rawId);
        if (!poi) {
            throw new AppError('POI not found', 404);
        }

        const status = poi.status;

        if (status === POI_STATUS.REJECTED) {
            return this._mapModerationDto(poi);
        }

        if (status === POI_STATUS.APPROVED || status === undefined || status === null) {
            throw new AppError('Cannot reject a POI that is already public', 409);
        }

        if (status !== POI_STATUS.PENDING) {
            throw new AppError('POI cannot be rejected from its current state', 409);
        }

        const session = await mongoose.startSession();
        try {
            let result;
            await session.withTransaction(async () => {
                let updated = await poiRepository.transitionPendingToRejected(rawId, reason, { session });
                if (!updated) {
                    const latest = await poiRepository.findById(rawId);
                    if (latest && latest.status === POI_STATUS.REJECTED) {
                        result = latest;
                        return;
                    }
                    throw new AppError('POI could not be rejected', 409);
                }

                await adminPoiAuditService.recordModeration({
                    adminId: adminUser._id,
                    poiId: updated._id,
                    action: AdminPoiAudit.ACTION.REJECT,
                    previousStatus: POI_STATUS.PENDING,
                    newStatus: POI_STATUS.REJECTED,
                    reason,
                    session
                });
                result = updated;
            });

            this._invalidateCache();
            return this._mapModerationDto(result);
        } finally {
            session.endSession();
        }
    }

    async createOwnerPoi(user, body) {
        const payload = this.validatePoiInput(body, { mode: 'owner' });

        const existing = await poiRepository.findByCode(payload.code);
        if (existing) {
            throw new AppError('A POI with this code already exists', 409);
        }

        this.checkDuplicateSubmission(user._id, payload.code);

        const doc = {
            code: payload.code,
            location: payload.location,
            radius: payload.radius,
            priority: payload.priority,
            languageCode: payload.languageCode,
            name: payload.name,
            summary: payload.summary,
            narrationShort: payload.narrationShort,
            narrationLong: payload.narrationLong,
            isPremiumOnly: false,
            status: POI_STATUS.PENDING,
            submittedBy: user._id
        };

        const poi = await poiRepository.create(doc);

        // PHASE 2B: Dual-write to poi_contents (even for pending POIs)
        try {
            await poiContentService.createContent({
                poiCode: poi.code,
                language: doc.languageCode,
                title: doc.name,
                description: doc.summary,
                narrationShort: doc.narrationShort,
                narrationLong: doc.narrationLong,
                version: 1
            });
        } catch (error) {
            console.error('[DUAL-WRITE] Failed to create poi_content for owner submission:', error);
        }

        const submitKey = `ownerSubmit:${String(user._id)}:${payload.code}`;
        ownerPoiSubmissionCache.set(submitKey, true);
        this._invalidateCache();

        return this._mapOwnerSubmittedPoi(poi);
    }

    async listOwnerSubmissions(user, query = {}) {
        const page = Math.max(parseInt(query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 100);
        const skip = (page - 1) * limit;

        const [pois, total] = await Promise.all([
            poiRepository.findBySubmitter(user._id, { limit, skip }),
            poiRepository.countBySubmitter(user._id)
        ]);

        // Fetch all active zones to map POI -> Zone
        const zones = await Zone.find({ isActive: true }).select('code name poiCodes');
        
        // Map: poiCode -> { code, name }
        const poiToZoneMap = {};
        zones.forEach(z => {
            if (z.poiCodes && Array.isArray(z.poiCodes)) {
                z.poiCodes.forEach(pc => {
                    poiToZoneMap[pc] = { code: z.code, name: z.name };
                });
            }
        });

        const totalPages = Math.ceil(total / limit) || 0;

        return {
            items: pois.map((p) => {
                const dto = this._mapModerationDto(p);
                dto.zone = poiToZoneMap[p.code] || null;
                return dto;
            }),
            pagination: { page, limit, total, totalPages }
        };
    }

    /**
     * DEPRECATED: POI QR system has been replaced with Zone QR
     * This endpoint is disabled. Use Zone QR instead.
     */
    async generateQrScanTokenForAdmin(rawPoiId) {
        throw new AppError('POI QR system has been deprecated. Use Zone QR instead. Contact admin for zone-based QR codes.', 410);
    }

    /**
     * DEPRECATED: POI QR system has been replaced with Zone QR
     * This endpoint is disabled. Use Zone QR instead.
     */
    async generateQrScanTokenForOwner(rawPoiId, user) {
        throw new AppError('POI QR system has been deprecated. Use Zone QR instead. Contact admin for zone-based QR codes.', 410);
    }

    /**
     * DEPRECATED: POI QR system has been replaced with Zone QR
     * This endpoint is disabled. Use Zone QR instead.
     */
    async resolveQrScanToken(rawToken, user, req) {
        throw new AppError('POI QR system has been deprecated. Use Zone QR scan endpoint: POST /api/v1/zones/scan', 410);
    }

    async requestPoiUpdate(poiId, user, body) {
        const poi = await poiRepository.findById(poiId);
        if (!poi) throw new AppError('POI not found', 404);
        if (String(poi.submittedBy) !== String(user._id)) {
            throw new AppError('Bạn không có quyền chỉnh sửa địa điểm này.', 403);
        }

        const mergedBody = {
            code: poi.code,
            radius: poi.radius,
            location: {
                lat: poi.location.coordinates[1],
                lng: poi.location.coordinates[0]
            },
            ...body
        };
        const payload = this.validatePoiInput(mergedBody, { mode: 'owner' });
        
        return PoiChangeRequest.create({
            poi_id: poiId,
            submittedBy: user._id,
            type: 'UPDATE',
            data: payload
        });
    }

    async requestPoiDelete(poiId, user) {
        const poi = await poiRepository.findById(poiId);
        if (!poi) throw new AppError('POI not found', 404);
        if (String(poi.submittedBy) !== String(user._id)) {
            throw new AppError('Bạn không có quyền yêu cầu xóa địa điểm này.', 403);
        }

        return PoiChangeRequest.create({
            poi_id: poiId,
            submittedBy: user._id,
            type: 'DELETE'
        });
    }

    async listPoiChangeRequests(query = {}) {
        const page = Math.max(parseInt(query.page) || 1, 1);
        const limit = Math.min(parseInt(query.limit) || 50, 100);
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            PoiChangeRequest.find({ status: 'PENDING' })
                .populate('poi_id')
                .populate('submittedBy', 'email')
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 }),
            PoiChangeRequest.countDocuments({ status: 'PENDING' })
        ]);

        return {
            items,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        };
    }

    async reviewPoiChangeRequest(id, adminUser, { status, reason }) {
        const req = await PoiChangeRequest.findById(id).populate('poi_id');
        if (!req) throw new AppError('Request not found', 404);
        if (req.status !== 'PENDING') throw new AppError('Yêu cầu đã được xử lý trước đó.', 400);

        req.status = status;
        req.reason = reason;
        await req.save();

        if (status === 'APPROVED') {
            if (req.type === 'DELETE') {
                await poiRepository.deleteById(req.poi_id._id);
            } else if (req.type === 'UPDATE') {
                // Apply update
                await poiRepository.updateById(req.poi_id._id, req.data);
            }
            this._invalidateCache();
        }

        return req;
    }

    async checkContentSync(lastSyncTime) {
        const lastSync = lastSyncTime ? new Date(lastSyncTime) : new Date(0);

        // Find POIs updated after lastSyncTime
        const updatedPois = await Poi.find({
            status: POI_STATUS.APPROVED,
            updatedAt: { $gt: lastSync }
        }).select('code updatedAt');

        // Find deleted POIs (status changed to REJECTED or deleted)
        const deletedPois = await Poi.find({
            status: { $in: [POI_STATUS.REJECTED] },
            updatedAt: { $gt: lastSync }
        }).select('code updatedAt');

        return {
            hasUpdates: updatedPois.length > 0 || deletedPois.length > 0,
            updatedPois: updatedPois.map(p => ({
                code: p.code,
                updatedAt: p.updatedAt
            })),
            deletedPois: deletedPois.map(p => ({
                code: p.code,
                deletedAt: p.updatedAt
            })),
            serverTime: new Date().toISOString()
        };
    }
}

module.exports = new PoiService();
