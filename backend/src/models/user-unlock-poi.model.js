const mongoose = require('mongoose');

/**
 * User Unlock POI Model
 * Tracks per-POI purchases by users
 */

const userUnlockPoiSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
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
    purchasePrice: {
        type: Number,
        required: true,
        min: 0
    },
    purchasedAt: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true
});

// Unique compound index (prevent duplicate purchases)
userUnlockPoiSchema.index({ userId: 1, poiCode: 1 }, { unique: true });

// Index for user queries
userUnlockPoiSchema.index({ userId: 1, purchasedAt: -1 });

// Static: Check if POI is unlocked
userUnlockPoiSchema.statics.isUnlocked = async function(userId, poiCode) {
    const unlock = await this.findOne({ userId, poiCode });
    return unlock !== null;
};

// Static: Get all unlocked POIs for user
userUnlockPoiSchema.statics.getUnlockedPois = async function(userId) {
    const unlocks = await this.find({ userId }).sort({ purchasedAt: -1 });
    return unlocks.map(u => u.poiCode);
};

// Static: Unlock POI (idempotent)
userUnlockPoiSchema.statics.unlockPoi = async function(userId, poiCode, price, options = {}) {
    try {
        const unlock = await this.create([{
            userId,
            poiCode,
            purchasePrice: price,
            purchasedAt: new Date()
        }], options);

        return unlock[0];
    } catch (error) {
        // If duplicate key error, POI already unlocked
        if (error.code === 11000) {
            return await this.findOne({ userId, poiCode });
        }
        throw error;
    }
};

const UserUnlockPoi = mongoose.model('UserUnlockPoi', userUnlockPoiSchema);

module.exports = UserUnlockPoi;
