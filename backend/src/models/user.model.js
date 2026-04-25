const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const { ROLES } = require('../constants/roles');

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true },
    fullName: { type: String, default: '' },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.USER },
    isPremium: { type: Boolean, default: false },
    premiumActivatedAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    qrScanCount: { type: Number, default: 0, min: 0 },
    qrScanLastResetDate: { type: String, default: null } // Format: YYYY-MM-DD UTC
}, {
    timestamps: true
});

userSchema.pre('save', async function() {
    if (!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = async function(candidatePassword, userPassword) {
    return await bcrypt.compare(candidatePassword, userPassword);
};

module.exports = mongoose.model('User', userSchema);
