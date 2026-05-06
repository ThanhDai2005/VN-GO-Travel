const mongoose = require('mongoose');
const { POI_STATUS } = require('../constants/poi-status');

const poiSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], required: true } // [longitude, latitude]
    },
    radius: { type: Number, required: true, default: 100 },
    priority: { type: Number, default: 0 },
    languageCode: { type: String, default: 'vi' },
    name: { type: String, required: true },
    summary: { type: String, default: '' },
    narrationShort: { type: String, default: '' },
    narrationLong: { type: String, default: '' },
    // Legacy fallback (old schema). Kept for backward compatibility while migrating data.
    content: { type: mongoose.Schema.Types.Mixed, default: null },
    // FIX: Add imageUrl field for POI thumbnails
    imageUrl: { type: String, default: null },
    isPremiumOnly: { type: Boolean, default: false },
    unlockPrice: { type: Number, default: 1, min: 0 }, // Credit cost to unlock (0 = free)
    status: {
        type: String,
        enum: Object.values(POI_STATUS),
        default: POI_STATUS.PENDING
    },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectionReason: { type: String, default: null, maxlength: 2000 },
    lastUpdated: { type: Date, default: Date.now }, // For content sync
    version: { type: Number, default: 1 } // Incremental version for reliable sync
}, {
    timestamps: true
});

// Auto-increment version on save
poiSchema.pre('save', function(next) {
    if (this.isModified() && !this.isNew) {
        this.version = (this.version || 1) + 1;
        this.lastUpdated = new Date();
    }
    if (typeof next === 'function') {
        next();
    }
});

// Auto-increment version on findOneAndUpdate
poiSchema.pre('findOneAndUpdate', async function() {
    const update = this.getUpdate();
    
    // Only increment version if there are actual content changes
    const contentFields = ['name', 'summary', 'narrationShort', 'narrationLong', 'radius', 'location', 'priority'];
    const hasContentChanges = contentFields.some(field => 
        update[field] !== undefined || (update.$set && update.$set[field] !== undefined)
    );

    if (hasContentChanges) {
        if (update.$inc) {
            update.$inc.version = 1;
        } else if (update.$set) {
            this.setUpdate({ 
                ...update, 
                $inc: { ...update.$inc, version: 1 }, 
                $set: { ...update.$set, lastUpdated: new Date() } 
            });
        } else {
            this.setUpdate({ 
                ...update, 
                $inc: { version: 1 }, 
                $set: { lastUpdated: new Date() } 
            });
        }
    }
});

poiSchema.index({ location: '2dsphere' });
poiSchema.index({ code: 1, status: 1 });
poiSchema.index({ version: 1 }); // For version-based sync queries

module.exports = mongoose.model('Poi', poiSchema);
