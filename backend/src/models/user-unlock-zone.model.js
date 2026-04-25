const mongoose = require('mongoose');

/**
 * User Unlock Zone Model
 * Tracks zone/tour purchases by users
 */

const userUnlockZoneSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    zoneCode: {
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
userUnlockZoneSchema.index({ userId: 1, zoneCode: 1 }, { unique: true });

// Index for user queries
userUnlockZoneSchema.index({ userId: 1, purchasedAt: -1 });

// Static: Check if zone is unlocked
userUnlockZoneSchema.statics.isUnlocked = async function(userId, zoneCode) {
    const unlock = await this.findOne({ userId, zoneCode });
    return unlock !== null;
};

// Static: Get all unlocked zones for user
userUnlockZoneSchema.statics.getUnlockedZones = async function(userId) {
    const unlocks = await this.find({ userId }).sort({ purchasedAt: -1 });
    return unlocks.map(u => u.zoneCode);
};

// Static: Unlock zone (idempotent)
userUnlockZoneSchema.statics.unlockZone = async function(userId, zoneCode, price, options = {}) {
    try {
        const unlock = await this.create([{
            userId,
            zoneCode,
            purchasePrice: price,
            purchasedAt: new Date()
        }], options);

        return unlock[0];
    } catch (error) {
        // If duplicate key error, zone already unlocked
        if (error.code === 11000) {
            return await this.findOne({ userId, zoneCode });
        }
        throw error;
    }
};

const UserUnlockZone = mongoose.model('UserUnlockZone', userUnlockZoneSchema);

module.exports = UserUnlockZone;
