const mongoose = require('mongoose');

const audioPlayEventSchema = new mongoose.Schema({
    poiCode: { type: String, required: true, index: true },
    zoneCode: { type: String, index: true },
    userId: { type: String, default: 'anonymous' },
    duration: { type: Number, required: true, default: 0 },
    completed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('AudioPlayEvent', audioPlayEventSchema);
