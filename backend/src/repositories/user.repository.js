const User = require('../models/user.model');

class UserRepository {
    async findByEmail(email) {
        return await User.findOne({ email }).select('+password');
    }
    
    async findById(id) {
        return await User.findById(id);
    }

    async updateUser(userId, updates) {
        return await User.findByIdAndUpdate(
            userId,
            updates,
            { new: true, runValidators: true }
        ).select('-password');
    }

    async updatePremiumStatus(userId, isPremium) {
        return await User.findByIdAndUpdate(userId, { isPremium }, { new: true });
    }
    
    // For seeder
    async createUser(userData) {
        return await User.create(userData);
    }

    async findAllSafe() {
        return await User.find({})
            .select('-password')
            .sort({ createdAt: -1 });
    }

    async updateRoleById(id, role) {
        return await User.findByIdAndUpdate(
            id,
            { role },
            { new: true, runValidators: true }
        ).select('-password');
    }

    async updatePremiumById(id, isPremium) {
        const user = await User.findById(id);
        if (!user) return null;

        const wasPremium = user.isPremium;
        user.isPremium = Boolean(isPremium);

        // Set premiumActivatedAt when user becomes premium for the first time
        if (!wasPremium && isPremium && !user.premiumActivatedAt) {
            user.premiumActivatedAt = new Date();
        }

        await user.save();
        return await User.findById(user._id).select('-password');
    }

    async updateActiveById(id, isActive) {
        return await User.findByIdAndUpdate(
            id,
            { isActive: Boolean(isActive) },
            { new: true, runValidators: true }
        ).select('-password');
    }

    async createByAdmin({ email, password, fullName = '', role, isPremium = false, isActive = true, qrScanCount = 0 }) {
        const created = await User.create({
            email,
            fullName: String(fullName || '').trim(),
            password,
            role,
            isPremium: Boolean(isPremium),
            premiumActivatedAt: isPremium ? new Date() : null,
            isActive: Boolean(isActive),
            qrScanCount: Math.max(0, Number(qrScanCount) || 0)
        });
        return await User.findById(created._id).select('-password');
    }

    async updateByAdmin(id, payload = {}) {
        const user = await User.findById(id).select('+password');
        if (!user) return null;

        const wasPremium = user.isPremium;

        if (Object.prototype.hasOwnProperty.call(payload, 'email')) {
            user.email = String(payload.email || '').trim().toLowerCase();
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'fullName')) {
            user.fullName = String(payload.fullName || '').trim();
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'role')) {
            user.role = payload.role;
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'isPremium')) {
            const newIsPremium = Boolean(payload.isPremium);
            user.isPremium = newIsPremium;

            // Set premiumActivatedAt when user becomes premium for the first time
            if (!wasPremium && newIsPremium && !user.premiumActivatedAt) {
                user.premiumActivatedAt = new Date();
            }
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'isActive')) {
            user.isActive = Boolean(payload.isActive);
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'qrScanCount')) {
            user.qrScanCount = Math.max(0, Number(payload.qrScanCount) || 0);
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'password') && payload.password) {
            user.password = payload.password;
        }

        await user.save();
        return await User.findById(user._id).select('-password');
    }

    async createDefaultUser({ email, password, fullName = '' }) {
        return await User.create({
            email: String(email || '').trim().toLowerCase(),
            fullName: String(fullName || '').trim(),
            password,
            role: 'USER',
            isPremium: false,
            isActive: true
        });
    }

    async incrementQrScanCountIfAllowed(userId, limit = 10) {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD UTC

        // Reset quota for all non-premium users if it's a new day
        await User.updateMany(
            {
                qrScanLastResetDate: { $ne: today },
                isPremium: false
            },
            {
                $set: {
                    qrScanCount: 0,
                    qrScanLastResetDate: today
                }
            }
        );

        // Increment with daily limit check
        return await User.findOneAndUpdate(
            {
                _id: userId,
                isPremium: false,
                isActive: true,
                qrScanCount: { $lt: Number(limit) }
            },
            {
                $inc: { qrScanCount: 1 },
                $set: { qrScanLastResetDate: today }
            },
            { new: true }
        );
    }
}

module.exports = new UserRepository();
