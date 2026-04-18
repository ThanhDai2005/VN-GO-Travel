const express = require('express');
const cors = require('cors');
const { errorHandler, AppError } = require('./middlewares/error.middleware');
const config = require('./config');

// Routes mapping
const authRoutes = require('./routes/auth.routes');
const poiRoutes = require('./routes/poi.routes');
const poiRequestRoutes = require('./routes/poi-request.routes');
const subscriptionRoutes = require('./routes/subscription.routes');
const ownerRoutes = require('./routes/owner.routes');
const premiumRoutes = require('./routes/premium.routes');
const adminPoiRoutes = require('./routes/admin-poi.routes');
const adminUserRoutes = require('./routes/admin-user.routes');
const intelligenceRoutes = require('./routes/intelligence.routes');
const intelligenceAdminRoutes = require('./routes/intelligence-admin.routes');

const app = express();

// Request Timeout Protection
const { requestTimeout } = require('./middlewares/timeout.middleware');
app.use(requestTimeout);

// Secure CORS configuration
const allowedOrigins = config.corsOrigin === '*' ? [] : config.corsOrigin.split(',');
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || config.corsOrigin === '*') return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
}));

app.use(express.json());

// Global Rate Limiter
const { rateLimiter } = require('./middlewares/rate-limit.middleware');
app.use(rateLimiter);

// Standardized Request Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] [REQ] ${req.method} ${req.url}`);
    next();
});

// Main routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/pois', poiRoutes);
app.use('/api/v1/poi-requests', poiRequestRoutes);
app.use('/api/v1/users/me/subscription', subscriptionRoutes);
app.use('/api/v1/owner', ownerRoutes);
app.use('/api/v1/premium', premiumRoutes);
app.use('/api/v1/admin/pois', adminPoiRoutes);
app.use('/api/v1/admin/users', adminUserRoutes);
app.use('/api/v1/intelligence/events', intelligenceRoutes);
app.use('/api/v1/admin/intelligence', intelligenceAdminRoutes);

// 404 Route Handler
app.use((req, res, next) => {
    next(new AppError(`Route ${req.originalUrl} not found`, 404));
});

// Global Error Handler
app.use(errorHandler);

module.exports = app;
