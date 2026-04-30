const mongoose = require('mongoose');

const audioSchema = new mongoose.Schema({
    hash: { type: String, required: true, unique: true, index: true },
    text: { type: String, required: true },
    normalizedText: { type: String, required: true },
    language: { type: String, required: true },
    voice: { type: String, default: 'female' },
    filePath: { type: String },
    audioUrl: { type: String },
    status: { 
        type: String, 
        enum: ['generating', 'ready', 'failed'], 
        default: 'generating' 
    },
    version: { type: Number, default: 1 },
    poiCode: { type: String, index: true },
    zoneCode: { type: String, index: true },
    
    // Hardening & Persistence
    retryCount: { type: Number, default: 0 },
    nextRetryAt: { type: Date },
    lastError: { type: String },
    
    // Analytics
    playCount: { type: Number, default: 0 },
    totalPlayTime: { type: Number, default: 0 }, // seconds
    lastPlayedAt: { type: Date },
    uniqueUsers: { type: Number, default: 0 },
    completionRate: { type: Number, default: 0 }, // 0 to 1
    
    error: { type: String } // Used for lock owner ID in generating phase
}, {
    timestamps: true
});

audioSchema.index({ poiCode: 1, language: 1, version: 1 });
audioSchema.index({ status: 1, nextRetryAt: 1 }); // For retry worker
audioSchema.index({ createdAt: 1 }); // For orphan cleanup/sorting

module.exports = mongoose.model('Audio', audioSchema);
