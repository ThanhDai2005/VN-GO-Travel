const cron = require('node-cron');
const User = require('../models/user.model');
const logger = require('../utils/logger');

/**
 * Daily QR Scan Quota Reset Job
 * Runs at 00:00 UTC every day to reset qrScanCount for all non-premium users
 */
class DailyQrResetJob {
    constructor() {
        this.cronExpression = '0 0 * * *'; // Every day at 00:00 UTC
        this.task = null;
    }

    async execute() {
        try {
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD UTC

            logger.info('[DailyQrResetJob] Starting daily QR scan quota reset...');

            const result = await User.updateMany(
                {
                    isPremium: false,
                    qrScanLastResetDate: { $ne: today }
                },
                {
                    $set: {
                        qrScanCount: 0,
                        qrScanLastResetDate: today
                    }
                }
            );

            logger.info(`[DailyQrResetJob] Reset complete. Users affected: ${result.modifiedCount}`);
        } catch (error) {
            logger.error('[DailyQrResetJob] Error during daily reset:', error);
        }
    }

    start() {
        if (this.task) {
            logger.warn('[DailyQrResetJob] Job already running');
            return;
        }

        this.task = cron.schedule(this.cronExpression, async () => {
            await this.execute();
        });

        logger.info(`[DailyQrResetJob] Scheduled: ${this.cronExpression} (00:00 UTC daily)`);
    }

    stop() {
        if (this.task) {
            this.task.stop();
            this.task = null;
            logger.info('[DailyQrResetJob] Stopped');
        }
    }

    // Manual trigger for testing
    async runNow() {
        logger.info('[DailyQrResetJob] Manual execution triggered');
        await this.execute();
    }
}

module.exports = new DailyQrResetJob();
