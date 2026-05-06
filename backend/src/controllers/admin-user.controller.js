const userRepository = require('../repositories/user.repository');
const { AppError } = require('../middlewares/error.middleware');
const { ROLES } = require('../constants/roles');
const mongoose = require('mongoose');

const allowedRoles = new Set(Object.values(ROLES));
const assignableRoles = new Set([ROLES.USER, ROLES.OWNER]);

function toUserResponse(u) {
    return {
        id: u._id,
        email: u.email,
        fullName: u.fullName || '',
        role: u.role,
        isPremium: Boolean(u.isPremium),
        isActive: u.isActive !== false,
        qrScanCount: Number(u.qrScanCount || 0),
        createdAt: u.createdAt,
        updatedAt: u.updatedAt
    };
}

exports.listUsers = async (req, res, next) => {
    try {
        const users = await userRepository.findAllSafe();
        const data = users
            .filter((u) => u.role !== ROLES.ADMIN)
            .map((u) => toUserResponse(u));
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

exports.createUser = async (req, res, next) => {
    try {
        const { email, password, fullName = '', role, isPremium = false, isActive = true, qrScanCount = 0 } = req.body || {};
        if (typeof email !== 'string' || !email.trim()) {
            throw new AppError('Email is required', 400);
        }
        if (typeof password !== 'string' || password.length < 6) {
            throw new AppError('Password must be at least 6 characters', 400);
        }
        if (typeof role !== 'string' || !allowedRoles.has(role)) {
            throw new AppError('Invalid role', 400);
        }
        if (!assignableRoles.has(role)) {
            throw new AppError('Không thể tạo thêm tài khoản ADMIN.', 400);
        }
        const existing = await userRepository.findByEmail(email.trim());
        if (existing) {
            throw new AppError('Email already exists', 409);
        }
        const user = await userRepository.createByAdmin({
            email: email.trim().toLowerCase(),
            fullName,
            password,
            role,
            isPremium,
            isActive,
            qrScanCount
        });

        // Initialize wallet with high credits for testing
        const walletRepository = require('../repositories/user-wallet.repository');
        await walletRepository.getOrCreate(user._id, 1000000000);

        res.status(201).json({
            success: true,
            data: toUserResponse(user)
        });
    } catch (error) {
        next(error);
    }
};

exports.updateRole = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { role } = req.body || {};
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new AppError('Invalid user id', 400);
        }
        if (String(req.user?._id) === String(id)) {
            throw new AppError('Bạn không thể tự thay đổi vai trò của chính mình.', 400);
        }
        if (typeof role !== 'string' || !allowedRoles.has(role)) {
            throw new AppError('Invalid role', 400);
        }
        if (!assignableRoles.has(role)) {
            throw new AppError('Không thể gán quyền ADMIN.', 400);
        }
        const target = await userRepository.findById(id);
        if (!target) {
            throw new AppError('User not found', 404);
        }
        if (target.role === ROLES.ADMIN) {
            throw new AppError('Không thể sửa tài khoản ADMIN duy nhất.', 400);
        }
        const user = await userRepository.updateRoleById(id, role);
        if (!user) {
            throw new AppError('User not found', 404);
        }
        res.status(200).json({
            success: true,
            data: toUserResponse(user)
        });
    } catch (error) {
        next(error);
    }
};

exports.updatePremium = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { isPremium } = req.body || {};
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new AppError('Invalid user id', 400);
        }
        if (String(req.user?._id) === String(id)) {
            throw new AppError('Bạn không thể tự chỉnh premium của chính mình.', 400);
        }
        if (typeof isPremium !== 'boolean') {
            throw new AppError('isPremium must be a boolean', 400);
        }
        const target = await userRepository.findById(id);
        if (!target) {
            throw new AppError('User not found', 404);
        }
        if (target.role === ROLES.ADMIN) {
            throw new AppError('Không thể sửa tài khoản ADMIN duy nhất.', 400);
        }
        const user = await userRepository.updatePremiumById(id, isPremium);
        if (!user) {
            throw new AppError('User not found', 404);
        }
        res.status(200).json({
            success: true,
            data: toUserResponse(user)
        });
    } catch (error) {
        next(error);
    }
};

exports.updateStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body || {};
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new AppError('Invalid user id', 400);
        }
        if (String(req.user?._id) === String(id)) {
            throw new AppError('Bạn không thể tự khóa tài khoản của chính mình.', 400);
        }
        if (typeof isActive !== 'boolean') {
            throw new AppError('isActive must be a boolean', 400);
        }
        const target = await userRepository.findById(id);
        if (!target) {
            throw new AppError('User not found', 404);
        }
        if (target.role === ROLES.ADMIN) {
            throw new AppError('Không thể sửa tài khoản ADMIN duy nhất.', 400);
        }
        const user = await userRepository.updateActiveById(id, isActive);
        if (!user) {
            throw new AppError('User not found', 404);
        }
        res.status(200).json({
            success: true,
            data: toUserResponse(user)
        });
    } catch (error) {
        next(error);
    }
};

exports.updateUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { email, fullName = '', password, role, isPremium, isActive, qrScanCount } = req.body || {};

        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new AppError('Invalid user id', 400);
        }
        if (String(req.user?._id) === String(id)) {
            throw new AppError('Bạn không thể tự chỉnh tài khoản của chính mình ở màn này.', 400);
        }

        const current = await userRepository.findById(id);
        if (!current) {
            throw new AppError('User not found', 404);
        }
        if (current.role === ROLES.ADMIN) {
            throw new AppError('Không thể sửa tài khoản ADMIN duy nhất.', 400);
        }

        if (typeof email !== 'string' || !email.trim()) {
            throw new AppError('Email is required', 400);
        }
        const normalizedEmail = email.trim().toLowerCase();
        const existing = await userRepository.findByEmail(normalizedEmail);
        if (existing && String(existing._id) !== String(id)) {
            throw new AppError('Email already exists', 409);
        }

        if (typeof role !== 'string' || !assignableRoles.has(role)) {
            throw new AppError('Role phải là USER hoặc OWNER.', 400);
        }
        if (typeof isPremium !== 'boolean') {
            throw new AppError('isPremium must be a boolean', 400);
        }
        if (typeof isActive !== 'boolean') {
            throw new AppError('isActive must be a boolean', 400);
        }
        if (qrScanCount !== undefined && (!Number.isInteger(Number(qrScanCount)) || Number(qrScanCount) < 0)) {
            throw new AppError('qrScanCount must be an integer >= 0', 400);
        }
        if (password !== undefined && password !== null && password !== '' && String(password).length < 6) {
            throw new AppError('Password must be at least 6 characters', 400);
        }

        const user = await userRepository.updateByAdmin(id, {
            email: normalizedEmail,
            fullName,
            role,
            isPremium,
            isActive,
            ...(qrScanCount !== undefined ? { qrScanCount: Number(qrScanCount) } : {}),
            ...(password ? { password: String(password) } : {})
        });

        res.status(200).json({
            success: true,
            data: toUserResponse(user)
        });
    } catch (error) {
        next(error);
    }
};
