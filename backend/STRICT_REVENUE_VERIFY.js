/**
 * STRICT REVENUE VERIFICATION SCRIPT
 * 
 * This script verifies the Revenue Analytics logic by:
 * 1. Seeding a known set of Zone Purchases
 * 2. Running the aggregation service
 * 3. Asserting against expected results
 */

const mongoose = require('mongoose');
const path = require('path');
const User = require('./src/models/user.model');
const Zone = require('./src/models/zone.model');
const UserUnlockZone = require('./src/models/user-unlock-zone.model');
const intelligenceMetricsService = require('./src/services/intelligence-metrics.service');

// Mock Config for local test
const MONGO_URI = 'mongodb://localhost:27017/vngo_travel'; // Adjust if needed

async function runTest() {
    console.log('🚀 STARTING REVENUE ANALYTICS VERIFICATION\n');

    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // --- CLEANUP ---
        console.log('🧹 Cleaning up test data...');
        await UserUnlockZone.deleteMany({ isTest: true });
        await User.deleteMany({ email: /test_revenue/ });
        await Zone.deleteMany({ code: /TEST_ZONE/ });

        // --- SEEDING ---
        console.log('🌱 Seeding test data...');
        
        // 1. Users
        const userA = await User.create({ email: 'test_revenue_a@vngo.com', fullName: 'User A', password: 'password123', isTest: true });
        const userB = await User.create({ email: 'test_revenue_b@vngo.com', fullName: 'User B', password: 'password123', isTest: true });
        
        // 2. Zones
        const zone1 = await Zone.create({ code: 'TEST_ZONE_1', name: 'Zone One', price: 100 });
        const zone2 = await Zone.create({ code: 'TEST_ZONE_2', name: 'Zone Two', price: 150 });
        const zone3 = await Zone.create({ code: 'TEST_ZONE_3', name: 'Zone Three', price: 200 });

        const now = new Date();
        const yesterday = new Date(); yesterday.setDate(now.getDate() - 1);
        const dayBefore = new Date(); dayBefore.setDate(now.getDate() - 2);

        // 3. Purchases
        // Today
        await UserUnlockZone.create({ userId: userA._id, zoneCode: zone1.code, purchasePrice: 100, purchasedAt: now, source: 'QR', serverVerified: true, isTest: true });
        await UserUnlockZone.create({ userId: userB._id, zoneCode: zone1.code, purchasePrice: 100, purchasedAt: now, source: 'MANUAL', serverVerified: false, isTest: true });
        
        // Yesterday
        await UserUnlockZone.create({ userId: userA._id, zoneCode: zone2.code, purchasePrice: 150, purchasedAt: yesterday, source: 'MAP', serverVerified: true, isTest: true });
        
        // Day Before
        await UserUnlockZone.create({ userId: userB._id, zoneCode: zone3.code, purchasePrice: 200, purchasedAt: dayBefore, source: 'QR', serverVerified: true, isTest: true });

        console.log('✅ Seeding complete.\n');

        // --- ANALYSIS ---
        console.log('📊 Running getRevenueAnalytics...');
        const start = dayBefore.toISOString();
        const end = now.toISOString();
        
        const results = await intelligenceMetricsService.getRevenueAnalytics({ start, end });

        // --- VERIFICATION ---
        console.log('\n--- VERIFICATION RESULTS ---');
        
        const expectations = {
            totalRevenue: 550,
            totalPurchases: 4,
            uniqueZonesSold: 3,
            bestSeller: 'Zone One'
        };

        let pass = true;

        // Check Summary
        if (results.summary.totalRevenue === expectations.totalRevenue) {
            console.log('✅ [PASS] Total Revenue: 550');
        } else {
            console.log(`❌ [FAIL] Total Revenue: Expected 550, got ${results.summary.totalRevenue}`);
            pass = false;
        }

        if (results.summary.totalPurchases === expectations.totalPurchases) {
            console.log('✅ [PASS] Total Purchases: 4');
        } else {
            console.log(`❌ [FAIL] Total Purchases: Expected 4, got ${results.summary.totalPurchases}`);
            pass = false;
        }

        if (results.summary.uniqueZonesSold === expectations.uniqueZonesSold) {
            console.log('✅ [PASS] Unique Zones: 3');
        } else {
            console.log(`❌ [FAIL] Unique Zones: Expected 3, got ${results.summary.uniqueZonesSold}`);
            pass = false;
        }

        if (results.summary.bestSeller === expectations.bestSeller) {
            console.log('✅ [PASS] Best Seller: Zone One');
        } else {
            console.log(`❌ [FAIL] Best Seller: Expected Zone One, got ${results.summary.bestSeller}`);
            pass = false;
        }

        // Check Top Zones
        const topZone = results.topZones[0];
        if (topZone.name === 'Zone One' && topZone.count === 2) {
            console.log('✅ [PASS] Top Zone Aggregation: Zone One (2 sales)');
        } else {
            console.log(`❌ [FAIL] Top Zone Aggregation: Expected Zone One (2), got ${topZone.name} (${topZone.count})`);
            pass = false;
        }

        // Check Transactions (Log Table)
        const manualTx = results.transactions.find(t => t.source === 'MANUAL');
        if (manualTx && manualTx.serverVerified === false && manualTx.userName === 'User B') {
            console.log('✅ [PASS] Transaction Log: Correct metadata (Manual, Unverified, User B)');
        } else {
            console.log('❌ [FAIL] Transaction Log: Metadata mismatch');
            pass = false;
        }

        // Check Timeline
        if (results.timeline.length >= 3) {
            console.log(`✅ [PASS] Timeline: Generated ${results.timeline.length} daily buckets`);
        } else {
            console.log(`❌ [FAIL] Timeline: Expected at least 3 days, got ${results.timeline.length}`);
            pass = false;
        }

        console.log('\n' + '='.repeat(40));
        if (pass) {
            console.log('🏆 FINAL VERDICT: 100% PASS');
        } else {
            console.log('🚫 FINAL VERDICT: FAILED');
        }
        console.log('='.repeat(40));

    } catch (err) {
        console.error('💥 TEST CRASHED:', err);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
}

runTest();
