require('dotenv').config();
const config = require('./config');
const app = require('./app');
const connectDB = require('./config/db');
const http = require('http');
const { Server } = require('socket.io');
const { initializeSocket } = require('./socket/audio-queue.socket');
const dailyQrResetJob = require('./jobs/daily-qr-reset.job');
const metricsService = require('./services/metrics.service');

const PORT = config.port;

const startServer = async () => {
    await connectDB();

    // Create HTTP server
    const server = http.createServer(app);

    // Initialize Socket.IO
    const io = new Server(server, {
        cors: {
            origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(','),
            methods: ['GET', 'POST']
        }
    });

    // Initialize audio queue socket handlers
    initializeSocket(io);

    // Start daily QR scan quota reset job
    dailyQrResetJob.start();

    // Start background workers
    const audioRetryWorker = require('./workers/audio-retry.worker');
    audioRetryWorker.start();

    // Initialize metrics service (auto-starts in constructor)
    console.log('[METRICS] Metrics service initialized');

    // Listen on IPv4 explicitly (0.0.0.0) to avoid IPv6 issues
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`Server is running on 0.0.0.0:${PORT} [${config.env}]`);
        console.log(`Socket.IO initialized for real-time audio queue`);
        console.log(`Daily QR reset job scheduled (00:00 UTC)`);
        console.log(`Metrics aggregation running (1-minute intervals)`);
    });
};

startServer();
