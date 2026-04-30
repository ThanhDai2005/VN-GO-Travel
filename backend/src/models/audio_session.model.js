const mongoose = require('mongoose');

const audioSessionSchema = new mongoose.Schema({
    poiCode: { type: String, required: true, index: true },
    userId: { type: String, default: 'anonymous' },
    audioHash: { type: String, required: true },
    duration: { type: Number, required: true, default: 0 },
    completed: { type: Boolean, default: false },
    playedAt: { type: Date, default: Date.now, index: true }
}, {
    timestamps: true
});

module.exports = mongoose.model('AudioSession', audioSessionSchema);
