const crypto = require('crypto');
const { AppError } = require('../middlewares/error.middleware');
const IntelligenceEventRaw = require('../models/intelligence-event-raw.model');
const IntelligenceUserSession = require('../models/intelligence-user-session.model');
const IntelligenceUserProfile = require('../models/intelligence-user-profile.model');
const IntelligenceDeviceProfile = require('../models/intelligence-device-profile.model');

const MAX_BATCH = 100;
const ALLOWED_SOURCE = new Set(['GAK', 'MSAL', 'NAV', 'ROEL']);
const ALLOWED_AUTH = new Set(['guest', 'logged_in', 'premium']);

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

function toRawDoc(ev, family, ts, ingestionRequestId) {
    return {
        event_id: ev.eventId || null,
        correlation_id: ev.correlationId,
        user_id: ev.userId || null,
        device_id: ev.deviceId,
        auth_state: ev.authState,
        source_system: ev.sourceSystem,
        event_family: family,
        payload: ev.payload && typeof ev.payload === 'object' ? ev.payload : {},
        runtime_tick_utc_ticks: typeof ev.runtimeTickUtcTicks === 'number' ? ev.runtimeTickUtcTicks : null,
        runtime_sequence: typeof ev.runtimeSequence === 'number' ? ev.runtimeSequence : null,
        contract_version: 'v2',
        rbel_mapping_version: ev.rbelMappingVersion,
        timestamp: ts,
        ingestion_request_id: ingestionRequestId
    };
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
            await IntelligenceEventRaw.create(doc);
            accepted += 1;
            await applyIdentityFromEvent(ev, doc);
        } catch (e) {
            const dup = e && (e.code === 11000 || e.code === 11001);
            if (dup) {
                duplicate += 1;
                continue;
            }
            if (e instanceof AppError) {
                errors.push({ index: i, code: e.statusCode === 403 ? 'FORBIDDEN' : 'VALIDATION', message: e.message });
                rejected += 1;
            } else {
                errors.push({ index: i, code: 'SERVER', message: e.message || 'insert failed' });
                rejected += 1;
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
