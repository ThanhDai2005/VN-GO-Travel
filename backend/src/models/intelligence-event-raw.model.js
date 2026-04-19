const mongoose = require('mongoose');

const ALLOWED_SOURCE = ['GAK', 'MSAL', 'NAV', 'ROEL'];
const ALLOWED_FAMILY = [
    'LocationEvent',
    'UserInteractionEvent',
    'NavigationEvent',
    'ObservabilityEvent'
];
const ALLOWED_AUTH = ['guest', 'logged_in', 'premium'];

const intelligenceEventRawSchema = new mongoose.Schema({
    event_id: { type: String, default: null, index: true },
    correlation_id: { type: String, required: true, index: true },
    user_id: { type: String, default: null, index: true },
    device_id: { type: String, required: true, index: true },
    auth_state: { type: String, required: true, enum: ALLOWED_AUTH },
    source_system: { type: String, required: true, enum: ALLOWED_SOURCE },
    event_family: { type: String, required: true, enum: ALLOWED_FAMILY },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    runtime_tick_utc_ticks: { type: Number, default: null },
    runtime_sequence: { type: Number, default: null },
    contract_version: { type: String, default: 'v2' },
    rbel_mapping_version: { type: String, required: true },
    timestamp: { type: Date, required: true },
    created_at: { type: Date, default: () => new Date() },
    ingestion_request_id: { type: String, default: null }
}, {
    collection: 'uis_events_raw',
    timestamps: false
});

intelligenceEventRawSchema.index(
    { device_id: 1, correlation_id: 1, runtime_sequence: 1 },
    {
        unique: true,
        partialFilterExpression: { runtime_sequence: { $type: 'number' } }
    }
);

intelligenceEventRawSchema.index(
    { device_id: 1, event_id: 1 },
    {
        unique: true,
        partialFilterExpression: { event_id: { $exists: true, $type: 'string', $gt: '' } }
    }
);

intelligenceEventRawSchema.index({ device_id: 1, timestamp: -1 });
intelligenceEventRawSchema.index({ correlation_id: 1, runtime_sequence: 1 });

module.exports = mongoose.model('IntelligenceEventRaw', intelligenceEventRawSchema);
