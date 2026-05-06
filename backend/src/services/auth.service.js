const jwt = require('jsonwebtoken');
const userRepository = require('../repositories/user.repository');
const { AppError } = require('../middlewares/error.middleware');
const config = require('../config');
const { ROLES } = require('../constants/roles');

class AuthService {
    signToken(id) {
        return jwt.sign({ id }, config.jwtSecret, {
            expiresIn: config.jwtExpiresIn
        });
    }

    async login(email, password) {
        if (!email || !password) {
            throw new AppError('Please provide email and password', 400);
        }

        if (typeof email !== 'string' || typeof password !== 'string') {
            throw new AppError('Email and password must be strings', 400);
        }

        const emailRegex = /^\S+@\S+\.\S+$/;
        if (!emailRegex.test(email)) {
            throw new AppError('Invalid email format', 400);
        }

        const user = await userRepository.findByEmail(email);
        
        if (!user || !(await user.comparePassword(password, user.password))) {
            throw new AppError('Incorrect email or password', 401);
        }
        if (user.isActive === false) {
            throw new AppError('Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Admin.', 403);
        }

        const token = this.signToken(user._id);

        // Fetch wallet balance
        const walletRepository = require('../repositories/user-wallet.repository');
        const wallet = await walletRepository.getOrCreate(user._id);
        const walletBalance = wallet ? wallet.balance : 0;

        // Remove password from output
        user.password = undefined;

        // DTO Mapping
        return {
            user: {
                id: user._id,
                email: user.email,
                fullName: user.fullName || '',
                role: user.role ?? ROLES.USER,
                isPremium: user.isPremium,
                isActive: user.isActive !== false,
                qrScanCount: Number(user.qrScanCount || 0),
                walletBalance: Number(walletBalance)
            },
            token
        };
    }

    async register(email, password, fullName = '') {
        if (!email || !password) {
            throw new AppError('Please provide email and password', 400);
        }

        if (typeof email !== 'string' || typeof password !== 'string') {
            throw new AppError('Email and password must be strings', 400);
        }

        const normalizedEmail = email.trim().toLowerCase();
        const emailRegex = /^\S+@\S+\.\S+$/;
        if (!emailRegex.test(normalizedEmail)) {
            throw new AppError('Invalid email format', 400);
        }

        if (password.length < 6) {
            throw new AppError('Password must be at least 6 characters', 400);
        }

        const existed = await userRepository.findByEmail(normalizedEmail);
        if (existed) {
            throw new AppError('Email already exists', 409);
        }

        const created = await userRepository.createDefaultUser({
            email: normalizedEmail,
            password,
            fullName: String(fullName || '').trim()
        });

        // Initialize wallet for new user
        const walletRepository = require('../repositories/user-wallet.repository');
        const wallet = await walletRepository.getOrCreate(created._id, 1000000000);
        const walletBalance = wallet ? wallet.balance : 1000000000;

        const token = this.signToken(created._id);
        return {
            user: {
                id: created._id,
                email: created.email,
                fullName: created.fullName || '',
                role: created.role ?? ROLES.USER,
                isPremium: created.isPremium === true,
                isActive: created.isActive !== false,
                qrScanCount: Number(created.qrScanCount || 0),
                walletBalance: Number(walletBalance)
            },
            token
        };
    }
}

module.exports = new AuthService();
