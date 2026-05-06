const authService = require('../services/auth.service');
const userRepository = require('../repositories/user.repository');

exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        const result = await authService.login(email, password);

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

exports.register = async (req, res, next) => {
    try {
        const { email, password, fullName } = req.body;
        const result = await authService.register(email, password, fullName);
        res.status(201).json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

exports.getMe = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const user = await userRepository.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const walletRepository = require('../repositories/user-wallet.repository');
        const wallet = await walletRepository.getOrCreate(userId);

        res.status(200).json({
            success: true,
            data: {
                id: user._id.toString(),
                email: user.email,
                fullName: user.fullName,
                role: user.role,
                isPremium: user.isPremium,
                walletBalance: wallet ? wallet.balance : 0
            }
        });
    } catch (error) {
        next(error);
    }
};
