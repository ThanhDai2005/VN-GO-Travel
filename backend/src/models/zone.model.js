const mongoose = require('mongoose');

/**
 * Zone Model
 * Represents tour packages/zones containing multiple POIs
 */

const zoneSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: ''
    },
    price: {
        type: Number,
        required: true,
        min: 1,
        default: 10
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    // Denormalized POI codes for quick access
    poiCodes: [{
        type: String,
        uppercase: true
    }],
    // Metadata
    imageUrl: {
        type: String,
        default: null
    },
    displayOrder: {
        type: Number,
        default: 0
    },
    tags: [{
        type: String,
        lowercase: true
    }]
}, {
    timestamps: true
});

// Indexes
zoneSchema.index({ code: 1 });
zoneSchema.index({ isActive: 1, displayOrder: 1 });

// Virtual: POI count
zoneSchema.virtual('poiCount').get(function() {
    return this.poiCodes ? this.poiCodes.length : 0;
});

// Method: Add POI to zone
zoneSchema.methods.addPoi = function(poiCode) {
    if (!this.poiCodes.includes(poiCode)) {
        this.poiCodes.push(poiCode);
    }
    return this.save();
};

// Method: Remove POI from zone
zoneSchema.methods.removePoi = function(poiCode) {
    this.poiCodes = this.poiCodes.filter(code => code !== poiCode);
    return this.save();
};

// Static: Find active zones
zoneSchema.statics.findActive = function() {
    return this.find({ isActive: true }).sort({ displayOrder: 1, name: 1 });
};

// Static: Find zones containing POI
zoneSchema.statics.findZonesContainingPoi = function(poiCode) {
    return this.find({
        isActive: true,
        poiCodes: poiCode
    });
};

const Zone = mongoose.model('Zone', zoneSchema);

module.exports = Zone;
