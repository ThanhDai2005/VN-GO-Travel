/**
 * Daily Stats Aggregation Script
 * Aggregates hourly stats into daily summaries
 *
 * Run manually: node scripts/aggregate-daily-stats.js
 * Or via cron: 0 1 * * * (daily at 1 AM UTC)
 */

const mongoose = require('mongoose');
require('dotenv').config();
const poiDailyStatsAggregator = require('../src/services/poi-daily-stats-aggregator.service');

async function main() {
    try {
        console.log('='.repeat(60));
        console.log('POI DAILY STATS AGGREGATION');
        console.log('='.repeat(60));
        console.log('Started at:', new Date().toISOString());

        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Get date from command line args or use yesterday
        const args = process.argv.slice(2);
        let targetDate;

        if (args[0] === '--date' && args[1]) {
            targetDate = new Date(args[1]);
            if (isNaN(targetDate.getTime())) {
                throw new Error('Invalid date format. Use YYYY-MM-DD');
            }
        } else if (args[0] === '--backfill' && args[1] && args[2]) {
            // Backfill mode
            const startDate = new Date(args[1]);
            const endDate = new Date(args[2]);

            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                throw new Error('Invalid date format. Use YYYY-MM-DD');
            }

            console.log(`\n📅 Backfill Mode: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

            const results = await poiDailyStatsAggregator.backfillDateRange(startDate, endDate);
            console.log(`\n✅ Backfilled ${results.length} POI-day records`);

            await mongoose.disconnect();
            console.log('✅ Disconnected from MongoDB');
            process.exit(0);
        } else {
            // Default: aggregate yesterday
            targetDate = new Date();
            targetDate.setUTCDate(targetDate.getUTCDate() - 1);
            targetDate.setUTCHours(0, 0, 0, 0);
        }

        console.log(`\n📅 Aggregating date: ${targetDate.toISOString().split('T')[0]}`);

        const results = await poiDailyStatsAggregator.aggregateDate(targetDate);

        console.log(`\n✅ Aggregated ${results.length} POI records`);

        if (results.length > 0) {
            console.log('\nSample results:');
            results.slice(0, 3).forEach(r => {
                console.log(`  POI ${r.poi_id}: ${r.unique_visitors} visitors, ${r.audio_starts} audio plays, engagement: ${r.engagement_score}`);
            });
        }

        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
        console.log('Completed at:', new Date().toISOString());
        console.log('='.repeat(60));

        process.exit(0);
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error.stack);
        await mongoose.disconnect();
        process.exit(1);
    }
}

main();
