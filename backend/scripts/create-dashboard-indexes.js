/**
 * Create Database Indexes for Dashboard Performance
 * Run: node scripts/create-dashboard-indexes.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function createIndexes() {
    try {
        console.log('='.repeat(60));
        console.log('CREATING DASHBOARD INDEXES');
        console.log('='.repeat(60));

        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;

        // PoiDailyStats indexes
        console.log('\n📊 Creating indexes for poi_daily_stats...');
        const poiDailyStats = db.collection('poi_daily_stats');

        await poiDailyStats.createIndex(
            { poi_id: 1, date: -1 },
            { name: 'idx_poi_date' }
        );
        console.log('  ✅ idx_poi_date');

        await poiDailyStats.createIndex(
            { date: -1 },
            { name: 'idx_date_desc' }
        );
        console.log('  ✅ idx_date_desc');

        await poiDailyStats.createIndex(
            { date: -1, unique_visitors: -1 },
            { name: 'idx_date_visitors' }
        );
        console.log('  ✅ idx_date_visitors');

        await poiDailyStats.createIndex(
            { date: -1, engagement_score: -1 },
            { name: 'idx_date_engagement' }
        );
        console.log('  ✅ idx_date_engagement');

        await poiDailyStats.createIndex(
            { poi_id: 1, date: 1 },
            { unique: true, name: 'uniq_poi_date' }
        );
        console.log('  ✅ uniq_poi_date (unique)');

        // PoiHourlyStats indexes (verify existing)
        console.log('\n📊 Verifying indexes for PoiHourlyStats...');
        const poiHourlyStats = db.collection('PoiHourlyStats');

        const existingIndexes = await poiHourlyStats.indexes();
        console.log('  Existing indexes:', existingIndexes.map(i => i.name).join(', '));

        // Create additional index for heatmap queries if not exists
        const hasHeatmapIndex = existingIndexes.some(i => i.name === 'idx_poi_hour_bucket');
        if (!hasHeatmapIndex) {
            await poiHourlyStats.createIndex(
                { poi_id: 1, hour_bucket: -1 },
                { name: 'idx_poi_hour_bucket' }
            );
            console.log('  ✅ idx_poi_hour_bucket (created)');
        } else {
            console.log('  ✅ idx_poi_hour_bucket (already exists)');
        }

        // POIs indexes (verify existing)
        console.log('\n📊 Verifying indexes for pois...');
        const pois = db.collection('pois');

        const poisIndexes = await pois.indexes();
        console.log('  Existing indexes:', poisIndexes.map(i => i.name).join(', '));

        // Create code index if not exists
        const hasCodeIndex = poisIndexes.some(i => i.name === 'idx_code');
        if (!hasCodeIndex) {
            await pois.createIndex(
                { code: 1 },
                { name: 'idx_code' }
            );
            console.log('  ✅ idx_code (created)');
        } else {
            console.log('  ✅ idx_code (already exists)');
        }

        // Create submittedBy + status index for owner queries
        const hasOwnerIndex = poisIndexes.some(i => i.name === 'idx_owner_status');
        if (!hasOwnerIndex) {
            await pois.createIndex(
                { submittedBy: 1, status: 1 },
                { name: 'idx_owner_status' }
            );
            console.log('  ✅ idx_owner_status (created)');
        } else {
            console.log('  ✅ idx_owner_status (already exists)');
        }

        console.log('\n✅ All indexes created successfully');
        console.log('='.repeat(60));

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error.stack);
        await mongoose.disconnect();
        process.exit(1);
    }
}

createIndexes();
