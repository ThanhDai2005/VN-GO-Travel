/**
 * Dashboard Performance Test
 * Tests all dashboard endpoints for response time and correctness
 */

const mongoose = require('mongoose');
require('dotenv').config();
const ownerDashboardService = require('./src/services/owner-dashboard.service');
const Poi = require('./src/models/poi.model');

const testResults = {
    passed: 0,
    failed: 0,
    tests: []
};

function logTest(name, status, responseTime, expected, actual) {
    const result = { name, status, responseTime, expected, actual };
    testResults.tests.push(result);

    if (status === 'PASS') {
        testResults.passed++;
        console.log(`✅ PASS: ${name} (${responseTime}ms)`);
    } else {
        testResults.failed++;
        console.error(`❌ FAIL: ${name} (${responseTime}ms)`);
        console.error(`   Expected: ${expected}`);
        console.error(`   Actual: ${actual}`);
    }
}

async function testDashboardPerformance() {
    console.log('\n');
    console.log('═'.repeat(70));
    console.log('  DASHBOARD PERFORMANCE TEST');
    console.log('  Date: 2026-04-23');
    console.log('═'.repeat(70));

    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Get test POI
        const testPoi = await Poi.findOne();
        if (!testPoi) {
            console.error('❌ No POIs found in database');
            process.exit(1);
        }

        const poiId = String(testPoi._id);
        const poiCode = testPoi.code;
        const ownerId = testPoi.submittedBy;

        console.log(`\n📍 Test POI: ${poiCode} (${poiId})`);
        console.log(`👤 Owner ID: ${ownerId}`);

        // TEST 1: POI Overview
        console.log('\n🧪 TEST 1: POI Overview');
        console.log('='.repeat(60));

        const start1 = Date.now();
        try {
            const overview = await ownerDashboardService.getPoiOverview(
                poiCode,
                ownerId,
                { from: '2026-04-16', to: '2026-04-23' }
            );
            const duration1 = Date.now() - start1;

            logTest(
                'POI Overview - Response Time',
                duration1 < 300 ? 'PASS' : 'FAIL',
                duration1,
                '< 300ms',
                `${duration1}ms`
            );

            logTest(
                'POI Overview - Data Structure',
                overview.poi && overview.summary && overview.daily_stats ? 'PASS' : 'FAIL',
                duration1,
                'Valid structure',
                overview.poi ? 'Valid' : 'Invalid'
            );

            console.log('  Summary:', JSON.stringify(overview.summary, null, 2));
        } catch (error) {
            logTest('POI Overview - Exception', 'FAIL', Date.now() - start1, 'No errors', error.message);
        }

        // TEST 2: Trends (Daily)
        console.log('\n🧪 TEST 2: Trends (Daily Granularity)');
        console.log('='.repeat(60));

        const start2 = Date.now();
        try {
            const trends = await ownerDashboardService.getTrends(
                poiId,
                ownerId,
                { from: '2026-04-16', to: '2026-04-23', granularity: 'daily' }
            );
            const duration2 = Date.now() - start2;

            logTest(
                'Trends Daily - Response Time',
                duration2 < 300 ? 'PASS' : 'FAIL',
                duration2,
                '< 300ms',
                `${duration2}ms`
            );

            logTest(
                'Trends Daily - Data Returned',
                Array.isArray(trends) && trends.length > 0 ? 'PASS' : 'FAIL',
                duration2,
                'Array with data',
                `Array with ${trends.length} items`
            );

            console.log(`  Returned ${trends.length} data points`);
        } catch (error) {
            logTest('Trends Daily - Exception', 'FAIL', Date.now() - start2, 'No errors', error.message);
        }

        // TEST 3: Trends (Hourly)
        console.log('\n🧪 TEST 3: Trends (Hourly Granularity)');
        console.log('='.repeat(60));

        const start3 = Date.now();
        try {
            const trends = await ownerDashboardService.getTrends(
                poiId,
                ownerId,
                { from: '2026-04-23', to: '2026-04-23', granularity: 'hourly' }
            );
            const duration3 = Date.now() - start3;

            logTest(
                'Trends Hourly - Response Time',
                duration3 < 300 ? 'PASS' : 'FAIL',
                duration3,
                '< 300ms',
                `${duration3}ms`
            );

            logTest(
                'Trends Hourly - Data Returned',
                Array.isArray(trends) ? 'PASS' : 'FAIL',
                duration3,
                'Array',
                `Array with ${trends.length} items`
            );

            console.log(`  Returned ${trends.length} hourly data points`);
        } catch (error) {
            logTest('Trends Hourly - Exception', 'FAIL', Date.now() - start3, 'No errors', error.message);
        }

        // TEST 4: Heatmap
        console.log('\n🧪 TEST 4: Heatmap');
        console.log('='.repeat(60));

        const start4 = Date.now();
        try {
            const heatmap = await ownerDashboardService.getHeatmap(
                poiId,
                ownerId,
                { from: '2026-04-17', to: '2026-04-23' }
            );
            const duration4 = Date.now() - start4;

            logTest(
                'Heatmap - Response Time',
                duration4 < 300 ? 'PASS' : 'FAIL',
                duration4,
                '< 300ms',
                `${duration4}ms`
            );

            logTest(
                'Heatmap - Grid Structure',
                Array.isArray(heatmap) && heatmap.length > 0 ? 'PASS' : 'FAIL',
                duration4,
                '7 days x 24 hours grid',
                `${heatmap.length} days`
            );

            console.log(`  Grid: ${heatmap.length} days x 24 hours`);
        } catch (error) {
            logTest('Heatmap - Exception', 'FAIL', Date.now() - start4, 'No errors', error.message);
        }

        // TEST 5: Cache Performance (Second Request)
        console.log('\n🧪 TEST 5: Cache Performance');
        console.log('='.repeat(60));

        const start5a = Date.now();
        await ownerDashboardService.getHeatmap(poiId, ownerId, { from: '2026-04-17', to: '2026-04-23' });
        const duration5a = Date.now() - start5a;

        const start5b = Date.now();
        await ownerDashboardService.getHeatmap(poiId, ownerId, { from: '2026-04-17', to: '2026-04-23' });
        const duration5b = Date.now() - start5b;

        logTest(
            'Cache - Second Request Faster',
            duration5b < duration5a ? 'PASS' : 'FAIL',
            duration5b,
            `< ${duration5a}ms`,
            `${duration5b}ms`
        );

        console.log(`  First request: ${duration5a}ms`);
        console.log(`  Second request (cached): ${duration5b}ms`);
        console.log(`  Speedup: ${Math.round((duration5a / duration5b) * 10) / 10}x`);

        // TEST 6: Concurrent Requests
        console.log('\n🧪 TEST 6: Concurrent Requests (20 simultaneous)');
        console.log('='.repeat(60));

        ownerDashboardService.clearCache(); // Clear cache for fair test

        const start6 = Date.now();
        const promises = [];
        for (let i = 0; i < 20; i++) {
            promises.push(
                ownerDashboardService.getPoiOverview(poiCode, ownerId, { from: '2026-04-16', to: '2026-04-23' })
            );
        }

        const results = await Promise.all(promises);
        const duration6 = Date.now() - start6;
        const avgDuration = duration6 / 20;

        logTest(
            'Concurrent - All Requests Successful',
            results.length === 20 ? 'PASS' : 'FAIL',
            duration6,
            '20 successful',
            `${results.length} successful`
        );

        logTest(
            'Concurrent - Average Response Time',
            avgDuration < 500 ? 'PASS' : 'FAIL',
            avgDuration,
            '< 500ms avg',
            `${Math.round(avgDuration)}ms avg`
        );

        console.log(`  Total time: ${duration6}ms`);
        console.log(`  Average per request: ${Math.round(avgDuration)}ms`);

        // Print summary
        console.log('\n');
        console.log('═'.repeat(70));
        console.log('  TEST SUMMARY');
        console.log('═'.repeat(70));
        console.log(`✅ PASSED: ${testResults.passed}`);
        console.log(`❌ FAILED: ${testResults.failed}`);
        console.log(`📊 TOTAL: ${testResults.tests.length}`);

        const passRate = ((testResults.passed / testResults.tests.length) * 100).toFixed(1);
        console.log(`\n📈 Pass Rate: ${passRate}%`);

        // Performance summary
        console.log('\n');
        console.log('═'.repeat(70));
        console.log('  PERFORMANCE SUMMARY');
        console.log('═'.repeat(70));

        const responseTimes = testResults.tests
            .filter(t => t.responseTime)
            .map(t => t.responseTime);

        const avgResponseTime = Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
        const maxResponseTime = Math.max(...responseTimes);
        const minResponseTime = Math.min(...responseTimes);

        console.log(`Average Response Time: ${avgResponseTime}ms`);
        console.log(`Min Response Time: ${minResponseTime}ms`);
        console.log(`Max Response Time: ${maxResponseTime}ms`);

        // Final verdict
        console.log('\n');
        console.log('═'.repeat(70));
        console.log('  FINAL VERDICT');
        console.log('═'.repeat(70));

        if (testResults.failed === 0 && avgResponseTime < 300) {
            console.log('✅ EXCELLENT PERFORMANCE');
            console.log('   All endpoints respond in < 300ms');
            console.log('   System is production-ready');
        } else if (testResults.failed === 0 && avgResponseTime < 500) {
            console.log('✅ GOOD PERFORMANCE');
            console.log('   All endpoints functional');
            console.log('   Performance is acceptable');
        } else if (testResults.failed <= 2) {
            console.log('⚠️  NEEDS OPTIMIZATION');
            console.log('   Some endpoints are slow or failing');
        } else {
            console.log('❌ PERFORMANCE ISSUES');
            console.log('   Multiple endpoints failing or too slow');
        }

        await mongoose.disconnect();
        console.log('\n✅ Tests completed. MongoDB disconnected.');

        process.exit(testResults.failed > 0 ? 1 : 0);

    } catch (error) {
        console.error('\n❌ FATAL ERROR:', error.message);
        console.error(error.stack);
        await mongoose.disconnect();
        process.exit(1);
    }
}

testDashboardPerformance();
