const mongoose = require('mongoose');

const intelligenceUserProfileSchema = new mongoose.Schema({
    user_id: { type: String, required: true, unique: true, index: true },
    device_ids: { type: [String], default: [] },
    role: { type: String, enum: ['guest', 'login', 'premium'], default: 'login' },
    last_active_at: { type: Date, required: true },
    merged_from_user_ids: { type: [String], default: [] }
}, {
    collection: 'uis_user_profiles',
    timestamps: true
});

module.exports = mongoose.model('IntelligenceUserProfile', intelligenceUserProfileSchema);
