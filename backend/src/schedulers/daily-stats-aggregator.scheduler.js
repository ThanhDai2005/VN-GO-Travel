const cron = require('node-cron');
const mongoose = require('mongoose');
const poiDailyStatsAggregator = require('../services/poi-daily-stats-aggregator.service');

/**
 * Daily Stats Aggregation Scheduler
 * Runs daily at 1:00 AM UTC
 * Aggregates previous day's stats
 */

let isRunning = false;

async function runDailyAggregation() {
    if (isRunning) {
        console.log('[DAILY-AGGREGATOR] Already running, skipping...');
        return;
    }

    isRunning = true;

    try {
        console.log('[DAILY-AGGREGATOR] Starting daily aggregation at', new Date().toISOString());

        const results = await poiDailyStatsAggregator.aggregateYesterday();

        console.log(`[DAILY-AGGREGATOR] ✅ Aggregated ${results.length} POI records`);

        isRunning = false;
    } catch (error) {
        console.error('[DAILY-AGGREGATOR] ❌ Error:', error.message);
        isRunning = false;
    }
}

function startScheduler() {
    console.log('[DAILY-AGGREGATOR] Scheduler started');
    console.log('[DAILY-AGGREGATOR] Will run daily at 1:00 AM UTC');

    // Run at 1:00 AM UTC every day
    cron.schedule('0 1 * * *', () => {
        runDailyAggregation();
    });

    // Optional: Run immediately on startup (for testing)
    if (process.env.RUN_AGGREGATION_ON_STARTUP === 'true') {
        console.log('[DAILY-AGGREGATOR] Running initial aggregation...');
        setTimeout(() => runDailyAggregation(), 5000);
    }
}

module.exports = { startScheduler, runDailyAggregation };
