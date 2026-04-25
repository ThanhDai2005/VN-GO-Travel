const crypto = require('crypto');
const mongoose = require('mongoose');
const { AppError } = require('../middlewares/error.middleware');
const IntelligenceEventRaw = require('../models/intelligence-event-raw.model');
const IntelligenceUserSession = require('../models/intelligence-user-session.model');
const IntelligenceUserProfile = require('../models/intelligence-user-profile.model');
const IntelligenceDeviceProfile = require('../models/intelligence-device-profile.model');
const IntelligenceIdentityEdge = require('../models/intelligence-identity-edge.model');
const PoiHourlyStats = require('../models/poi-hourly-stats.model');

const MAX_BATCH = 100;
const ALLOWED_SOURCE = new Set(['GAK', 'MSAL', 'NAV', 'ROEL']);
const ALLOWED_AUTH = new Set(['guest', 'logged_in', 'premium']);

function getHourBucket(date) {
    const d = new Date(date);
    d.setMinutes(0, 0, 0);
    return d.toISOString();
}

/** Map RBEL wire `rbelEventFamily` to stored `event_family`. */
const FAMILY_MAP = {
    location: 'LocationEvent',
    user_interaction: 'UserInteractionEvent',
    navigation: 'NavigationEvent',
    observability: 'ObservabilityEvent',
    LocationEvent: 'LocationEvent',
    UserInteractionEvent: 'UserInteractionEvent',
    NavigationEvent: 'NavigationEvent',
    ObservabilityEvent: 'ObservabilityEvent'
};

function mapEventFamily(rbelFamily) {
    if (!rbelFamily || typeof rbelFamily !== 'string') return null;
    return FAMILY_MAP[rbelFamily] || null;
}

function validateAuthStateUserType(authState, userType) {
    if (!userType) return true;
    const t = String(userType).toLowerCase();
    if (authState === 'guest') return t === 'guest';
    if (authState === 'logged_in') return t === 'user' || t === 'guest';
    if (authState === 'premium') return t === 'premium' || t === 'user';
    return true;
}

function validateOneEvent(ev, index) {
    const prefix = `events[${index}]`;
    if (!ev || typeof ev !== 'object') {
        throw new AppError(`${prefix}: must be an object`, 400);
    }
    if (ev.contractVersion !== 'v2') {
        throw new AppError(`${prefix}: contractVersion must be "v2"`, 400);
    }
    if (!ev.deviceId || typeof ev.deviceId !== 'string') {
        throw new AppError(`${prefix}: deviceId is required`, 400);
    }
    if (!ev.correlationId || typeof ev.correlationId !== 'string') {
        throw new AppError(`${prefix}: correlationId is required`, 400);
    }
    if (!ev.authState || !ALLOWED_AUTH.has(ev.authState)) {
        throw new AppError(`${prefix}: authState must be guest|logged_in|premium`, 400);
    }
    if (!ev.sourceSystem || !ALLOWED_SOURCE.has(ev.sourceSystem)) {
        throw new AppError(`${prefix}: sourceSystem must be GAK|MSAL|NAV|ROEL`, 400);
    }
    const family = mapEventFamily(ev.rbelEventFamily);
    if (!family) {
        throw new AppError(`${prefix}: rbelEventFamily invalid`, 400);
    }
    if (!ev.rbelMappingVersion || typeof ev.rbelMappingVersion !== 'string') {
        throw new AppError(`${prefix}: rbelMappingVersion is required`, 400);
    }
    if (!ev.timestamp) {
        throw new AppError(`${prefix}: timestamp is required`, 400);
    }
    const ts = new Date(ev.timestamp);
    if (Number.isNaN(ts.getTime())) {
        throw new AppError(`${prefix}: timestamp must be a valid date`, 400);
    }
    if (!validateAuthStateUserType(ev.authState, ev.userType)) {
        throw new AppError(`${prefix}: userType inconsistent with authState`, 400);
    }
    return { family, ts };
}

function generateEventHash(doc) {
    const deviceId = doc.device_id || 'unknown';
    const poiId = (doc.payload && doc.payload.poi_id) ? String(doc.payload.poi_id) : 'no_poi';
    const tsStr = doc.timestamp ? new Date(doc.timestamp).toISOString() : 'no_time';
    const typeStr = doc.event_family || 'no_type';

    return crypto
        .createHash('md5')
        .update(deviceId + poiId + tsStr + typeStr)
        .digest('hex');
}

function toRawDoc(ev, family, ts, ingestionRequestId) {
    const payload = ev.payload && typeof ev.payload === 'object' ? { ...ev.payload } : {};
    
    // Explicitly link to POI ID from contract
    if (ev.poiId) {
        payload.poi_id = ev.poiId;
    }

    const doc = {
        event_id: ev.eventId || null,
        correlation_id: ev.correlationId,
        user_id: ev.userId || null,
        device_id: ev.deviceId,
        auth_state: ev.authState,
        source_system: ev.sourceSystem,
        event_family: family,
        payload,
        runtime_tick_utc_ticks: typeof ev.runtimeTickUtcTicks === 'number' ? ev.runtimeTickUtcTicks : null,
        runtime_sequence: typeof ev.runtimeSequence === 'number' ? ev.runtimeSequence : null,
        contract_version: 'v2',
        rbel_mapping_version: ev.rbelMappingVersion,
        timestamp: ts,
        ingestion_request_id: ingestionRequestId
    };
    doc.event_hash = generateEventHash(doc);
    return doc;
}

const Poi = require('../models/poi.model');

/**
 * Resolves POI from DB to ensure strict data lineage.
 * Overwrites client-provided coordinates with authoritative ones.
 */
async function resolvePoiAndFixGeo(doc) {
    if (!doc.payload || !doc.payload.poi_id) return false;

    try {
        const poiId = String(doc.payload.poi_id);
        // Flexible lookup: checks ObjectID first, then Code fallback (matching legacy client)
        const lookup = mongoose.Types.ObjectId.isValid(poiId) 
            ? { _id: poiId } 
            : { code: poiId.toUpperCase() };

        const poi = await Poi.findOne(lookup).select('_id code location').lean();
        
        if (!poi) {
            console.warn(`[INGESTION] Rejected event: POI ${poiId} not found in database.`);
            return false; 
        }

        // 🟢 HARD CONSTRAINT: Overwrite coordinates with truth data
        doc.payload.poi_id = String(poi._id); // Normalize to technical ID
        doc.payload.poi_code = poi.code;
        
        if (poi.location && poi.location.coordinates) {
            doc.payload.longitude = poi.location.coordinates[0];
            doc.payload.latitude = poi.location.coordinates[1];
        }

        return true;
    } catch (err) {
        console.error(`[INGESTION] Error resolving POI ${doc.payload.poi_id}:`, err);
        return false;
    }
}

async function applyIdentityFromEvent(ev, doc) {
    const {
        device_id, user_id, auth_state, timestamp, event_id, correlation_id
    } = doc;
    const ts = timestamp instanceof Date ? timestamp : new Date(timestamp);
    const sid = (ev.sessionId && String(ev.sessionId)) || `anon:${device_id}`;

    await IntelligenceDeviceProfile.findOneAndUpdate(
        { device_id },
        {
            $set: {
                last_active_at: ts,
                ...(user_id ? { linked_user_id: user_id } : {})
            },
            $setOnInsert: { guest_role: 'guest' }
        },
        { upsert: true }
    );

    if (user_id) {
        const role = auth_state === 'premium' ? 'premium' : 'login';
        await IntelligenceUserProfile.findOneAndUpdate(
            { user_id },
            {
                $set: { last_active_at: ts, role },
                $addToSet: { device_ids: device_id }
            },
            { upsert: true }
        );
    }

    const existing = await IntelligenceUserSession.findOne({ session_id: sid });
    if (!existing) {
        await IntelligenceUserSession.create({
            session_id: sid,
            device_id,
            user_id: user_id || null,
            start_time: ts,
            last_seen: ts,
            auth_state_current: auth_state,
            auth_transitions: [{
                at: ts, from: null, to: auth_state, source_event_id: event_id || null
            }],
            correlation_ids_sample: correlation_id ? [correlation_id] : []
        });
    } else {
        const pushTrans = existing.auth_state_current !== auth_state;
        const sample = [...(existing.correlation_ids_sample || [])];
        if (correlation_id && sample.length < 50 && !sample.includes(correlation_id)) {
            sample.push(correlation_id);
        }
        const update = {
            $set: {
                last_seen: ts,
                device_id,
                user_id: user_id || existing.user_id,
                correlation_ids_sample: sample
            }
        };
        if (pushTrans) {
            update.$set.auth_state_current = auth_state;
            update.$push = {
                auth_transitions: {
                    at: ts,
                    from: existing.auth_state_current,
                    to: auth_state,
                    source_event_id: event_id || null
                }
            };
        }
        await IntelligenceUserSession.updateOne({ session_id: sid }, update);
    }
}

/**
 * Create identity edge per v7.3.2 §6
 * Links device to user when JWT authenticated
 */
async function createIdentityEdge(deviceId, userId, ingestionRequestId, reqUser) {
    if (!deviceId || !userId) return;

    try {
        // Only create edge if JWT authenticated (reqUser present)
        if (!reqUser) return;

        // Confidence is "high" when userId matches authenticated user
        const confidence = String(userId) === String(reqUser._id) ? 'high' : 'medium';

        await IntelligenceIdentityEdge.findOneAndUpdate(
            {
                edge_type: 'device_linked_user',
                from_id: deviceId,
                to_id: userId
            },
            {
                $setOnInsert: {
                    edge_type: 'device_linked_user',
                    from_id: deviceId,
                    to_id: userId,
                    established_at: new Date(),
                    source: 'ingest_jwt',
                    confidence,
                    ingestion_request_id: ingestionRequestId
                }
            },
            { upsert: true }
        );
    } catch (error) {
        console.error('[IDENTITY-EDGE] Failed to create edge:', error);
    }
}

/**
 * Ingest RBEL EventContractV2 batch. Does not call runtime (GAK/MSAL/ROEL).
 */
async function ingestBatch(body, reqUser, options = {}) {
    const { headerDeviceId } = options;
    if (!body || typeof body !== 'object') {
        throw new AppError('Body must be a JSON object', 400);
    }
    if (body.schema && body.schema !== 'event-contract-v2') {
        throw new AppError('schema must be event-contract-v2', 400);
    }
    const events = body.events;
    if (!Array.isArray(events) || events.length === 0) {
        throw new AppError('events must be a non-empty array', 400);
    }
    if (events.length > MAX_BATCH) {
        throw new AppError(`events length must be <= ${MAX_BATCH}`, 413);
    }

    const ingestionRequestId = crypto.randomUUID();
    const errors = [];
    let accepted = 0;
    let rejected = 0;
    let duplicate = 0;

    const validDocs = [];
    const validEvents = [];

    for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        try {
            if (reqUser && ev.userId && String(ev.userId) !== String(reqUser._id)) {
                throw new AppError('userId must match authenticated user', 403);
            }
            if (headerDeviceId && ev.deviceId !== headerDeviceId) {
                throw new AppError('deviceId must match X-Device-Id header', 400);
            }
            const { family, ts } = validateOneEvent(ev, i);
            const doc = toRawDoc(ev, family, ts, ingestionRequestId);
            validDocs.push(doc);
            validEvents.push(ev);
        } catch (e) {
            if (e instanceof AppError) {
                errors.push({ index: i, code: e.statusCode === 403 ? 'FORBIDDEN' : 'VALIDATION', message: e.message });
            } else {
                errors.push({ index: i, code: 'SERVER', message: e.message || 'validation failed' });
            }
            rejected += 1;
        }
    }

    let insertedDocs = [];
    if (validDocs.length > 0) {
        try {
            insertedDocs = await IntelligenceEventRaw.insertMany(validDocs, { ordered: false, rawResult: true });
            insertedDocs = validDocs; // If all successful, validDocs map 1:1
            accepted = validDocs.length;
        } catch (e) {
            if (e.name === 'BulkWriteError' || (e.code === 11000 && Array.isArray(e.insertedDocs))) {
                insertedDocs = e.insertedDocs || [];
                accepted = insertedDocs.length;
                duplicate = validDocs.length - insertedDocs.length;
            } else if (e.code === 11000) {
                // Single 11000 duplicate error
                duplicate = validDocs.length; 
            } else {
                errors.push({ index: -1, code: 'SERVER', message: 'bulk insert failed' });
            }
        }
    }

    // Still map identities and rollups
    for (let i = 0; i < validEvents.length; i++) {
        const doc = validDocs[i];
        
        // 🟢 HARD CONSTRAINT: Validate and Resolve POI truth
        if (doc.payload && doc.payload.poi_id) {
            const resolved = await resolvePoiAndFixGeo(doc);
            if (!resolved) {
                // Skip ingestion for this specific event if POI is invalid
                accepted--;
                rejected++;
                errors.push({ index: i, code: 'INVALID_POI', message: `POI ID ${doc.payload.poi_id} is invalid or not found.` });
                continue;
            }
        } else if (doc.event_family === 'LocationEvent') {
            // Rejection policy: Location events without POI are not allowed in this system 
            // as per "ALL heatmap events MUST be LINKED to a VALID POI ID"
            accepted--;
            rejected++;
            errors.push({ index: i, code: 'MISSING_POI', message: 'LocationEvent must include a valid poi_id for heatmap lineage.' });
            continue;
        }

        await applyIdentityFromEvent(validEvents[i], doc).catch(() => {});

        // Create identity edge when user_id present and JWT authenticated
        if (doc.user_id && reqUser) {
            await createIdentityEdge(doc.device_id, doc.user_id, ingestionRequestId, reqUser).catch(() => {});
        }

        if (doc.payload && doc.payload.poi_id) {
            try {
                const hourBucket = getHourBucket(doc.timestamp);
                const poiId = String(doc.payload.poi_id);

                await PoiHourlyStats.findOneAndUpdate(
                    { poi_id: poiId, hour_bucket: hourBucket },
                    {
                        $addToSet: { unique_devices: doc.device_id },
                        $set: { updated_at: new Date() }
                    },
                    { upsert: true, new: true }
                );
            } catch (err) {
                // Ignore concurrent modify error
            }
        }
    }

    return {
        accepted,
        rejected,
        duplicate,
        requestId: ingestionRequestId,
        errors
    };
}

async function ingestSingle(body, reqUser, options) {
    return ingestBatch({ schema: 'event-contract-v2', events: [body] }, reqUser, options);
}

async function getJourneyByCorrelationId(correlationId, { limit = 500 } = {}) {
    if (!correlationId || typeof correlationId !== 'string') {
        throw new AppError('correlationId is required', 400);
    }
    const rows = await IntelligenceEventRaw.find({ correlation_id: correlationId })
        .sort({ runtime_tick_utc_ticks: 1, runtime_sequence: 1, timestamp: 1, created_at: 1 })
        .limit(Math.min(limit, 2000))
        .lean();
    return rows;
}

async function getSummary({ from, to }) {
    const match = {};
    if (from || to) {
        match.timestamp = {};
        if (from) match.timestamp.$gte = new Date(from);
        if (to) match.timestamp.$lte = new Date(to);
    }
    const [byAuth, byFamily, total] = await Promise.all([
        IntelligenceEventRaw.aggregate([
            { $match: match },
            { $group: { _id: '$auth_state', count: { $sum: 1 } } }
        ]),
        IntelligenceEventRaw.aggregate([
            { $match: match },
            { $group: { _id: '$event_family', count: { $sum: 1 } } }
        ]),
        IntelligenceEventRaw.countDocuments(match)
    ]);
    return { total, byAuthState: byAuth, byEventFamily: byFamily };
}

module.exports = {
    ingestBatch,
    ingestSingle,
    getJourneyByCorrelationId,
    getSummary,
    MAX_BATCH
};
