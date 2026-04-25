const mongoose = require('mongoose');

/**
 * Revoked QR Token Model
 * Stores blacklisted JWT IDs (jti) for revoked zone QR tokens
 */

const revokedTokenSchema = new mongoose.Schema({
    jti: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    zoneId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Zone',
        required: true
    },
    zoneCode: {
        type: String,
        required: true
    },
    revokedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    revokedAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    reason: {
        type: String,
        default: 'Manual revocation'
    },
    // Auto-delete after token would have expired anyway
    expiresAt: {
        type: Date,
        required: true,
        index: true
    }
}, {
    timestamps: true
});

// TTL index: auto-delete documents after expiresAt
revokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Static: Check if token is revoked
revokedTokenSchema.statics.isRevoked = async function(jti) {
    const doc = await this.findOne({ jti });
    return !!doc;
};

// Static: Revoke token
revokedTokenSchema.statics.revokeToken = async function(jti, zoneId, zoneCode, revokedBy, expiresAt, reason) {
    return this.create({
        jti,
        zoneId,
        zoneCode,
        revokedBy,
        expiresAt,
        reason: reason || 'Manual revocation'
    });
};

const RevokedToken = mongoose.model('RevokedToken', revokedTokenSchema);

module.exports = RevokedToken;
