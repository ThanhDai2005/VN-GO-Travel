const requiredEnv = ['MONGO_URI', 'JWT_SECRET'];

// Validate critical env variables at startup
const missing = requiredEnv.filter(env => !process.env[env]);
if (missing.length > 0) {
    console.error(`[FATAL] Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
}

const config = {
    env: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3000,
    mongoUri: process.env.MONGO_URI,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: '7d',
    corsOrigin: process.env.CORS_ORIGIN || '*',
    rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        max: 100 // limit each IP to 100 requests per windowMs
    },
    cache: {
        ttl: parseInt(process.env.CACHE_TTL) || 60, // 60 seconds
    },
    timeout: {
        ms: parseInt(process.env.REQUEST_TIMEOUT) || 10000, // 10 seconds
    },
    /** Short-lived JWT for QR payloads (`type: qr_scan`). */
    qrScanTokenExpiresIn: process.env.QR_SCAN_TOKEN_EXPIRES_IN || '24h',
    /**
     * Base URL encoded into QR (no trailing slash). Query `?t=<jwt>` is appended by the service.
     * Must match what the mobile app parses (see QrResolver scan URL).
     */
    scanQrUrlBase: (process.env.SCAN_QR_URL_BASE || 'https://thuyetminh.netlify.app/app/scan').replace(/\/$/, ''),
    /** Optional. When set, `POST /api/v1/intelligence/events/*` accepts `X-Api-Key` for guest/device ingestion (RBEL). */
    intelligenceIngestApiKey: process.env.INTELLIGENCE_INGEST_API_KEY || ''
};

console.log('[INIT] Configuration loaded and validated successfully');

module.exports = config;
