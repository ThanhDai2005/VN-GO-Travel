const jwt = require('jsonwebtoken');
const { AppError } = require('./error.middleware');
const User = require('../models/user.model');
const config = require('../config');

const requireAuth = async (req, res, next) => {
    try {
        let token;
        
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            throw new AppError('Not authorized to access this route', 401);
        }

        const decoded = jwt.verify(token, config.jwtSecret);
        
        const user = await User.findById(decoded.id);

        if (!user) {
            throw new AppError('The user belonging to this token does no longer exist.', 401);
        }

        req.user = user;
        next();
    } catch (err) {
        next(new AppError(err.message || 'Not authorized', 401));
    }
};

const protect = requireAuth;

const optionalAuth = async (req, res, next) => {
    try {
        let token;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }
        if (!token) {
            req.user = null;
            return next();
        }

        const decoded = jwt.verify(token, config.jwtSecret);
        const user = await User.findById(decoded.id);
        req.user = user || null;
        return next();
    } catch {
        req.user = null;
        return next();
    }
};

module.exports = { protect, requireAuth, optionalAuth };
