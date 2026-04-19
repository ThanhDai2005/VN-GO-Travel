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

const poiCache = new Cache(config.cache.ttl);
const ownerPoiSubmissionCache = new Cache(10);

setInterval(() => poiCache.cleanup(), 3600000);
setInterval(() => ownerPoiSubmissionCache.cleanup(), 60000);

class PoiService {
    static USER_QR_SCAN_LIMIT = 10;
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
            isPremiumOnly: poi.isPremiumOnly
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

    async getPoiByCode(code, lang = 'en') {
        const cacheKey = `poi:${code}:${lang}`;
        const cachedPoi = poiCache.get(cacheKey);
        if (cachedPoi) {
            console.log(`[CACHE] Hit: ${cacheKey}`);
            return cachedPoi;
        }

        const poi = await poiRepository.findByCode(code, { publicOnly: true });

        if (!poi) {
            throw new AppError('POI not found', 404);
        }

        const result = this.mapPoiDto(poi, lang);
        
        // Store in cache
        poiCache.set(cacheKey, result);

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

        const totalPages = Math.ceil(total / limit) || 0;

        return {
            items: pois.map((p) => this._mapModerationDto(p)),
            pagination: { page, limit, total, totalPages }
        };
    }

    /**
     * ADMIN: mint permanent signed JWT for printed QR (`type: static_secure_qr`).
     * No exp — physical QR stays valid; tampering fails signature verify.
     */
    async generateQrScanTokenForAdmin(rawPoiId) {
        if (!rawPoiId || typeof rawPoiId !== 'string') {
            throw new AppError('POI id is required', 400);
        }
        if (!poiRepository.isValidObjectId(rawPoiId)) {
            throw new AppError('Invalid POI id', 400);
        }
        const doc = await poiRepository.findById(rawPoiId);
        if (!doc) {
            throw new AppError('POI not found', 404);
        }
        const code = String(doc.code || '').trim();
        const token = jwt.sign(
            { code, type: 'static_secure_qr' },
            config.jwtSecret
        );
        const scanUrl = `${config.scanQrUrlBase}?t=${encodeURIComponent(token)}`;
        return { token, scanUrl, permanent: true };
    }

    /**
     * Redeem QR JWT and return POI.
     * - Guest users are allowed to scan and consume summary flow in app.
     * - Logged-in non-premium users still consume QR quota.
     */
    async resolveQrScanToken(rawToken, user) {
        if (!rawToken || typeof rawToken !== 'string' || !rawToken.trim()) {
            throw new AppError('token is required', 400);
        }
        let decoded;
        try {
            decoded = jwt.verify(rawToken.trim(), config.jwtSecret);
        } catch (e) {
            throw new AppError('Invalid or expired QR token', 401);
        }

        let poi = null;
        if (decoded.type === 'static_secure_qr' && decoded.code) {
            const code = String(decoded.code).trim().toUpperCase();
            poi = await poiRepository.findByCode(code);
        } else if (decoded.type === 'qr_scan' && decoded.poiId) {
            poi = await poiRepository.findById(decoded.poiId);
        } else {
            throw new AppError('Invalid QR token payload', 400);
        }

        if (!poi) {
            throw new AppError('POI not found', 404);
        }
        const st = poi.status;
        if (st === POI_STATUS.PENDING || st === POI_STATUS.REJECTED) {
            throw new AppError('POI is not available for scanning', 403);
        }
        if (st && st !== POI_STATUS.APPROVED) {
            throw new AppError('POI is not available for scanning', 403);
        }
        if (poi.isPremiumOnly && !(user && user.isPremium)) {
            throw new AppError('Premium subscription required for this POI', 403);
        }

        // Non-premium logged-in users: max 10 scans total. Premium users: unlimited.
        if (user && !user.isPremium) {
            const updated = await userRepository.incrementQrScanCountIfAllowed(
                user._id,
                PoiService.USER_QR_SCAN_LIMIT
            );
            if (!updated) {
                throw new AppError('Bạn đã dùng hết 10 lượt quét QR miễn phí. Vui lòng nâng cấp VIP để quét không giới hạn.', 403);
            }
        }

        this._invalidateCache();
        return this._mapModerationDto(poi);
    }
}

module.exports = new PoiService();
