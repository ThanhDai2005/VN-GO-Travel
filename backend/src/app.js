const express = require('express');
const cors = require('cors');
const { errorHandler, AppError } = require('./middlewares/error.middleware');
const config = require('./config');
const DemoFailSafe = require('./middlewares/demo-failsafe.middleware');
const demoPerformanceOptimizer = require('./utils/demo-performance');

// Routes mapping
const authRoutes = require('./routes/auth.routes');
const poiRoutes = require('./routes/poi.routes');
const poiRequestRoutes = require('./routes/poi-request.routes');
const subscriptionRoutes = require('./routes/subscription.routes');
const ownerRoutes = require('./routes/owner.routes');
const premiumRoutes = require('./routes/premium.routes');
const adminPoiRoutes = require('./routes/admin-poi.routes');
const adminZoneRoutes = require('./routes/admin-zone.routes');
const adminUserRoutes = require('./routes/admin-user.routes');
const intelligenceAdminRoutes = require('./routes/intelligence-admin.routes');
const intelligenceOwnerRoutes = require('./routes/intelligence-owner.routes');
const deviceRoutes = require('./routes/device.routes');
const audioQueueRoutes = require('./routes/audio-queue.routes');
const userAudioQueueRoutes = require('./routes/user-audio-queue.routes');
const purchaseRoutes = require('./routes/purchase.routes');
const zoneRoutes = require('./routes/zone.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const monitoringRoutes = require('./routes/monitoring.routes');
const publicZoneRoutes = require('./routes/public.zone.routes');

const app = express();

// Trust proxy to get correct client IP (support IPv4)
// This ensures req.ip returns IPv4 addresses correctly
app.set('trust proxy', true);

// Security Headers (Helmet)
const { securityHeaders } = require('./middlewares/security-headers.middleware');
app.use(securityHeaders);

// Request Timeout Protection (Bypass for long audio generation)
const { requestTimeout } = require('./middlewares/timeout.middleware');
app.use((req, res, next) => {
    if (req.path.startsWith('/api/v1/audio/generate')) {
        return next();
    }
    requestTimeout(req, res, next);
});

// Performance monitoring headers
app.use(demoPerformanceOptimizer.performanceHeaders);

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

// Request body size limit
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Sanitize input (prevent NoSQL injection)
// Custom implementation (express-mongo-sanitize incompatible with Express 5.x)
const { sanitizeInput } = require('./middlewares/sanitize.middleware');
app.use(sanitizeInput);

// Demo mode fail-safe (skip rate limits if enabled)
app.use(DemoFailSafe.skipRateLimitInDemo);

// Global Rate Limiter (Redis-based if available)
const { globalRateLimiter } = require('./middlewares/advanced-rate-limit.middleware');
app.use((req, res, next) => {
    if (req.skipRateLimit) {
        return next();
    }
    globalRateLimiter(req, res, next);
});

// Demo mode auto-grant credits
app.use(DemoFailSafe.autoGrantCreditsInDemo);

// Standardized Request Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] [REQ] ${req.method} ${req.url}`);
    next();
});

// Demo health check endpoint
app.get('/api/v1/demo/health', DemoFailSafe.demoHealthCheck);

const path = require('path');
// Serve static audio files
app.use('/storage/audio', express.static(path.join(process.cwd(), 'storage', 'audio')));

// Main routes
app.use('/api/v1/public/zones', publicZoneRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/pois', poiRoutes);
app.use('/api/v1/audio', require('./routes/audio.routes'));
app.use('/api/v1/poi-requests', poiRequestRoutes);
app.use('/api/v1/users/me/subscription', subscriptionRoutes);
app.use('/api/v1/owner', ownerRoutes);
app.use('/api/v1/premium', premiumRoutes);
app.use('/api/v1/admin/pois', adminPoiRoutes);
app.use('/api/v1/admin/zones', adminZoneRoutes);
app.use('/api/v1/admin/users', adminUserRoutes);
app.use('/api/v1/admin/intelligence', intelligenceAdminRoutes);
app.use('/api/v1/admin/dashboard', dashboardRoutes);
app.use('/api/v1/admin/monitoring', monitoringRoutes);
app.use('/api/v1/owner/intelligence', intelligenceOwnerRoutes);
app.use('/api/v1/devices', deviceRoutes);
app.use('/api/v1/audio-queue', audioQueueRoutes);
app.use('/api/v1/user-audio-queue', userAudioQueueRoutes);
app.use('/api/v1/purchase', purchaseRoutes);
app.use('/api/v1/zones', zoneRoutes);

// 404 Route Handler
app.use((req, res, next) => {
    next(new AppError(`Route ${req.originalUrl} not found`, 404));
});

// Demo mode error handler (must be before global error handler)
if (config.demo.enabled) {
    app.use(DemoFailSafe.demoErrorHandler);
}

// Global Error Handler
app.use(errorHandler);

module.exports = app;
