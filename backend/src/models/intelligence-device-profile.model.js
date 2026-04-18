const mongoose = require('mongoose');

const intelligenceDeviceProfileSchema = new mongoose.Schema({
    device_id: { type: String, required: true, unique: true, index: true },
    guest_role: { type: String, default: 'guest' },
    last_active_at: { type: Date, required: true },
    linked_user_id: { type: String, default: null, index: true }
}, {
    collection: 'uis_device_profiles',
    timestamps: true
});

module.exports = mongoose.model('IntelligenceDeviceProfile', intelligenceDeviceProfileSchema);
