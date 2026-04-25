const mongoose = require('mongoose');

/**
 * Zone POI Model
 * N-N mapping between zones and POIs (normalized)
 */

const zonePoiSchema = new mongoose.Schema({
    zoneId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Zone',
        required: true,
        index: true
    },
    poiCode: {
        type: String,
        required: true,
        uppercase: true,
        trim: true,
        index: true
    },
    orderIndex: {
        type: Number,
        default: 0,
        min: 0
    }
}, {
    timestamps: true
});

// Compound unique index
zonePoiSchema.index({ zoneId: 1, poiCode: 1 }, { unique: true });

// Compound index for ordering
zonePoiSchema.index({ zoneId: 1, orderIndex: 1 });

// Static: Get POIs for zone
zonePoiSchema.statics.getPoiCodesForZone = async function(zoneId) {
    const mappings = await this.find({ zoneId }).sort({ orderIndex: 1 });
    return mappings.map(m => m.poiCode);
};

// Static: Get zones for POI
zonePoiSchema.statics.getZonesForPoi = async function(poiCode) {
    const mappings = await this.find({ poiCode }).populate('zoneId');
    return mappings.map(m => m.zoneId);
};

const ZonePoi = mongoose.model('ZonePoi', zonePoiSchema);

module.exports = ZonePoi;
