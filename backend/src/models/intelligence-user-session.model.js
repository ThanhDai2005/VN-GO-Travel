const mongoose = require('mongoose');

const authTransitionSchema = new mongoose.Schema({
    at: { type: Date, required: true },
    from: { type: String },
    to: { type: String, required: true },
    source_event_id: { type: String, default: null }
}, { _id: false });

const intelligenceUserSessionSchema = new mongoose.Schema({
    session_id: { type: String, required: true, unique: true, index: true },
    device_id: { type: String, required: true, index: true },
    user_id: { type: String, default: null },
    start_time: { type: Date, required: true },
    last_seen: { type: Date, required: true },
    auth_state_current: { type: String, required: true },
    auth_transitions: { type: [authTransitionSchema], default: [] },
    correlation_ids_sample: { type: [String], default: [] }
}, {
    collection: 'uis_user_sessions',
    timestamps: true
});

intelligenceUserSessionSchema.index({ device_id: 1, last_seen: -1 });

module.exports = mongoose.model('IntelligenceUserSession', intelligenceUserSessionSchema);
