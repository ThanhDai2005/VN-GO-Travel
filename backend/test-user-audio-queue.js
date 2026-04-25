/**
 * User Audio Queue System - Comprehensive Test Suite
 * Tests: Single user, multiple users, concurrency, edge cases
 */

const userAudioQueueService = require('./src/services/user-audio-queue.service');

const testResults = {
    passed: 0,
    failed: 0,
    tests: []
};

function logTest(name, status, expected, actual, notes = '') {
    const result = { name, status, expected, actual, notes };
    testResults.tests.push(result);

    if (status === 'PASS') {
        testResults.passed++;
        console.log(`✅ PASS: ${name}`);
    } else {
        testResults.failed++;
        console.error(`❌ FAIL: ${name}`);
        console.error(`   Expected: ${expected}`);
        console.error(`   Actual: ${actual}`);
        if (notes) console.error(`   Notes: ${notes}`);
    }
}

// Helper: Sleep
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// TEST 1: SINGLE USER - BASIC ENQUEUE
// ============================================================================
async function testSingleUserBasicEnqueue() {
    console.log('\n🧪 TEST 1: SINGLE USER - BASIC ENQUEUE');
    console.log('='.repeat(60));

    const userId = 'user_test_1';
    const deviceId = 'device_test_1';

    try {
        // Enqueue first audio (should play immediately)
        const result1 = await userAudioQueueService.enqueue(
            userId,
            'POI_1',
            'audio_poi1_vi_short',
            deviceId,
            { language: 'vi', narrationLength: 'short' }
        );

        logTest(
            'Single User - First Audio Plays Immediately',
            result1.action === 'playing' && result1.position === 0 ? 'PASS' : 'FAIL',
            'action: playing, position: 0',
            `action: ${result1.action}, position: ${result1.position}`
        );

        // Enqueue second audio (should queue)
        const result2 = await userAudioQueueService.enqueue(
            userId,
            'POI_2',
            'audio_poi2_vi_short',
            deviceId,
            { language: 'vi', narrationLength: 'short' }
        );

        logTest(
            'Single User - Second Audio Queued',
            result2.action === 'queued' && result2.position === 1 ? 'PASS' : 'FAIL',
            'action: queued, position: 1',
            `action: ${result2.action}, position: ${result2.position}`
        );

        // Check user state
        const state = await userAudioQueueService.getUserState(userId);

        logTest(
            'Single User - State Correct',
            state.status === 'playing' && state.queueLength === 1 ? 'PASS' : 'FAIL',
            'status: playing, queueLength: 1',
            `status: ${state.status}, queueLength: ${state.queueLength}`
        );

        // Complete first audio
        const complete1 = await userAudioQueueService.completeAudio(userId, deviceId);

        logTest(
            'Single User - Complete Plays Next',
            complete1.completed && complete1.nextAudio !== null ? 'PASS' : 'FAIL',
            'completed: true, nextAudio: not null',
            `completed: ${complete1.completed}, nextAudio: ${complete1.nextAudio ? 'exists' : 'null'}`
        );

        // Complete second audio
        const complete2 = await userAudioQueueService.completeAudio(userId, deviceId);

        logTest(
            'Single User - Complete Goes Idle',
            complete2.completed && complete2.status === 'idle' ? 'PASS' : 'FAIL',
            'completed: true, status: idle',
            `completed: ${complete2.completed}, status: ${complete2.status}`
        );

    } catch (error) {
        logTest('Single User - Exception', 'FAIL', 'No errors', error.message);
    }
}

// ============================================================================
// TEST 2: DUPLICATE DETECTION
// ============================================================================
async function testDuplicateDetection() {
    console.log('\n🧪 TEST 2: DUPLICATE DETECTION');
    console.log('='.repeat(60));

    const userId = 'user_test_2';
    const deviceId = 'device_test_2';

    try {
        // Enqueue audio
        await userAudioQueueService.enqueue(
            userId,
            'POI_1',
            'audio_poi1_vi_short',
            deviceId,
            { language: 'vi', narrationLength: 'short' }
        );

        // Try to enqueue same audio again (should ignore)
        const result = await userAudioQueueService.enqueue(
            userId,
            'POI_1',
            'audio_poi1_vi_short',
            deviceId,
            { language: 'vi', narrationLength: 'short' }
        );

        logTest(
            'Duplicate - Same Audio Ignored',
            result.action === 'ignored' && result.reason === 'already_playing' ? 'PASS' : 'FAIL',
            'action: ignored, reason: already_playing',
            `action: ${result.action}, reason: ${result.reason}`
        );

        // Enqueue different audio
        await userAudioQueueService.enqueue(
            userId,
            'POI_2',
            'audio_poi2_vi_short',
            deviceId,
            { language: 'vi', narrationLength: 'short' }
        );

        // Try to enqueue same audio again (should ignore - in queue)
        const result2 = await userAudioQueueService.enqueue(
            userId,
            'POI_2',
            'audio_poi2_vi_short',
            deviceId,
            { language: 'vi', narrationLength: 'short' }
        );

        logTest(
            'Duplicate - Queued Audio Ignored',
            result2.action === 'ignored' && result2.reason === 'already_queued' ? 'PASS' : 'FAIL',
            'action: ignored, reason: already_queued',
            `action: ${result2.action}, reason: ${result2.reason}`
        );

    } catch (error) {
        logTest('Duplicate Detection - Exception', 'FAIL', 'No errors', error.message);
    }
}

// ============================================================================
// TEST 3: QUEUE LIMIT
// ============================================================================
async function testQueueLimit() {
    console.log('\n🧪 TEST 3: QUEUE LIMIT');
    console.log('='.repeat(60));

    const userId = 'user_test_3';
    const deviceId = 'device_test_3';

    try {
        // Enqueue 6 audios (1 playing + 5 queued = max)
        for (let i = 1; i <= 6; i++) {
            await userAudioQueueService.enqueue(
                userId,
                `POI_${i}`,
                `audio_poi${i}_vi_short`,
                deviceId,
                { language: 'vi', narrationLength: 'short' }
            );
        }

        // Try to enqueue 7th (should reject)
        const result = await userAudioQueueService.enqueue(
            userId,
            'POI_7',
            'audio_poi7_vi_short',
            deviceId,
            { language: 'vi', narrationLength: 'short' }
        );

        logTest(
            'Queue Limit - 7th Audio Rejected',
            result.action === 'rejected' && result.reason === 'queue_full' ? 'PASS' : 'FAIL',
            'action: rejected, reason: queue_full',
            `action: ${result.action}, reason: ${result.reason}`
        );

    } catch (error) {
        logTest('Queue Limit - Exception', 'FAIL', 'No errors', error.message);
    }
}

// ============================================================================
// TEST 4: MULTIPLE USERS - SAME POI
// ============================================================================
async function testMultipleUsersSamePOI() {
    console.log('\n🧪 TEST 4: MULTIPLE USERS - SAME POI');
    console.log('='.repeat(60));

    try {
        // 50 users enter same POI simultaneously
        const promises = [];
        for (let i = 1; i <= 50; i++) {
            promises.push(
                userAudioQueueService.enqueue(
                    `user_multi_${i}`,
                    'POI_SHARED',
                    'audio_poi_shared_vi_short',
                    `device_multi_${i}`,
                    { language: 'vi', narrationLength: 'short' }
                )
            );
        }

        const results = await Promise.all(promises);

        // All should play immediately (independent queues)
        const allPlaying = results.every(r => r.action === 'playing');

        logTest(
            'Multiple Users - All Play Independently',
            allPlaying ? 'PASS' : 'FAIL',
            '50 users all playing',
            `${results.filter(r => r.action === 'playing').length} users playing`
        );

        // Check system stats
        const stats = userAudioQueueService.getStats();

        logTest(
            'Multiple Users - Stats Correct',
            stats.totalUsers >= 50 ? 'PASS' : 'FAIL',
            '>= 50 users',
            `${stats.totalUsers} users`
        );

    } catch (error) {
        logTest('Multiple Users - Exception', 'FAIL', 'No errors', error.message);
    }
}

// ============================================================================
// TEST 5: CONCURRENCY SAFETY
// ============================================================================
async function testConcurrencySafety() {
    console.log('\n🧪 TEST 5: CONCURRENCY SAFETY');
    console.log('='.repeat(60));

    const userId = 'user_test_concurrency';
    const deviceId = 'device_test_concurrency';

    try {
        // Same user, 10 simultaneous enqueue requests
        const promises = [];
        for (let i = 1; i <= 10; i++) {
            promises.push(
                userAudioQueueService.enqueue(
                    userId,
                    `POI_${i}`,
                    `audio_poi${i}_vi_short`,
                    deviceId,
                    { language: 'vi', narrationLength: 'short' }
                )
            );
        }

        const results = await Promise.all(promises);

        // One should play, rest should queue
        const playing = results.filter(r => r.action === 'playing').length;
        const queued = results.filter(r => r.action === 'queued').length;
        const rejected = results.filter(r => r.action === 'rejected').length;

        logTest(
            'Concurrency - One Playing, Rest Queued or Rejected',
            playing === 1 && (queued + rejected) === 9 ? 'PASS' : 'FAIL',
            '1 playing, 9 queued/rejected (queue limit 5)',
            `${playing} playing, ${queued} queued, ${rejected} rejected`
        );

        // Check no duplicates in queue
        const state = await userAudioQueueService.getUserState(userId);
        const audioIds = state.queue.map(item => item.audioId);
        const uniqueAudioIds = new Set(audioIds);

        logTest(
            'Concurrency - No Duplicate Queue Items',
            audioIds.length === uniqueAudioIds.size ? 'PASS' : 'FAIL',
            'No duplicates',
            audioIds.length === uniqueAudioIds.size ? 'No duplicates' : `${audioIds.length - uniqueAudioIds.size} duplicates`
        );

    } catch (error) {
        logTest('Concurrency Safety - Exception', 'FAIL', 'No errors', error.message);
    }
}

// ============================================================================
// TEST 6: FAST MOVEMENT (Multiple POIs)
// ============================================================================
async function testFastMovement() {
    console.log('\n🧪 TEST 6: FAST MOVEMENT (Multiple POIs)');
    console.log('='.repeat(60));

    const userId = 'user_test_fast';
    const deviceId = 'device_test_fast';

    try {
        // User enters 5 POIs in quick succession
        for (let i = 1; i <= 5; i++) {
            await userAudioQueueService.enqueue(
                userId,
                `POI_FAST_${i}`,
                `audio_poi_fast_${i}_vi_short`,
                deviceId,
                { language: 'vi', narrationLength: 'short' }
            );
            await sleep(100);  // 100ms between POIs
        }

        const state = await userAudioQueueService.getUserState(userId);

        // Should have 1 playing + 4 queued = 5 total
        const totalAudio = (state.currentAudio ? 1 : 0) + state.queueLength;

        logTest(
            'Fast Movement - All Audio Queued',
            totalAudio === 5 ? 'PASS' : 'FAIL',
            '5 audio items (1 playing + 4 queued)',
            `${totalAudio} audio items`
        );

    } catch (error) {
        logTest('Fast Movement - Exception', 'FAIL', 'No errors', error.message);
    }
}

// ============================================================================
// TEST 7: INTERRUPT AND CANCEL
// ============================================================================
async function testInterruptAndCancel() {
    console.log('\n🧪 TEST 7: INTERRUPT AND CANCEL');
    console.log('='.repeat(60));

    const userId = 'user_test_interrupt';
    const deviceId = 'device_test_interrupt';

    try {
        // Enqueue 3 audios
        await userAudioQueueService.enqueue(userId, 'POI_1', 'audio_1', deviceId, {});
        await userAudioQueueService.enqueue(userId, 'POI_2', 'audio_2', deviceId, {});
        await userAudioQueueService.enqueue(userId, 'POI_3', 'audio_3', deviceId, {});

        // Interrupt current audio
        const interrupt = await userAudioQueueService.interruptAudio(userId, deviceId, 'test');

        logTest(
            'Interrupt - Plays Next',
            interrupt.interrupted && interrupt.nextAudio !== null ? 'PASS' : 'FAIL',
            'interrupted: true, nextAudio: not null',
            `interrupted: ${interrupt.interrupted}, nextAudio: ${interrupt.nextAudio ? 'exists' : 'null'}`
        );

        // Cancel all
        const cancel = await userAudioQueueService.cancelAll(userId, deviceId);

        logTest(
            'Cancel All - Clears Queue',
            cancel.cancelled && cancel.clearedQueueItems > 0 ? 'PASS' : 'FAIL',
            'cancelled: true, cleared items > 0',
            `cancelled: ${cancel.cancelled}, cleared: ${cancel.clearedQueueItems}`
        );

        // Check state is idle
        const state = await userAudioQueueService.getUserState(userId);

        logTest(
            'Cancel All - Goes Idle',
            state.status === 'idle' && state.queueLength === 0 ? 'PASS' : 'FAIL',
            'status: idle, queueLength: 0',
            `status: ${state.status}, queueLength: ${state.queueLength}`
        );

    } catch (error) {
        logTest('Interrupt and Cancel - Exception', 'FAIL', 'No errors', error.message);
    }
}

// ============================================================================
// TEST 8: PERFORMANCE - ENQUEUE LATENCY
// ============================================================================
async function testPerformance() {
    console.log('\n🧪 TEST 8: PERFORMANCE - ENQUEUE LATENCY');
    console.log('='.repeat(60));

    const userId = 'user_test_perf';
    const deviceId = 'device_test_perf';

    try {
        // Measure single enqueue latency
        const start = Date.now();
        await userAudioQueueService.enqueue(userId, 'POI_PERF', 'audio_perf', deviceId, {});
        const latency = Date.now() - start;

        logTest(
            'Performance - Enqueue Latency',
            latency < 50 ? 'PASS' : 'FAIL',
            '< 50ms',
            `${latency}ms`
        );

        // Measure 100 concurrent enqueues
        const start2 = Date.now();
        const promises = [];
        for (let i = 0; i < 100; i++) {
            promises.push(
                userAudioQueueService.enqueue(`user_perf_${i}`, 'POI_PERF', 'audio_perf', `device_${i}`, {})
            );
        }
        await Promise.all(promises);
        const totalTime = Date.now() - start2;
        const avgLatency = totalTime / 100;

        logTest(
            'Performance - 100 Concurrent Enqueues',
            avgLatency < 100 ? 'PASS' : 'FAIL',
            '< 100ms avg',
            `${Math.round(avgLatency)}ms avg (${totalTime}ms total)`
        );

    } catch (error) {
        logTest('Performance - Exception', 'FAIL', 'No errors', error.message);
    }
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================
async function runAllTests() {
    console.log('\n');
    console.log('═'.repeat(70));
    console.log('  USER AUDIO QUEUE SYSTEM - COMPREHENSIVE TEST');
    console.log('  Date: 2026-04-23');
    console.log('═'.repeat(70));

    try {
        await testSingleUserBasicEnqueue();
        await testDuplicateDetection();
        await testQueueLimit();
        await testMultipleUsersSamePOI();
        await testConcurrencySafety();
        await testFastMovement();
        await testInterruptAndCancel();
        await testPerformance();

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

        // System stats
        const stats = userAudioQueueService.getStats();
        console.log('\n');
        console.log('═'.repeat(70));
        console.log('  SYSTEM STATISTICS');
        console.log('═'.repeat(70));
        console.log(`Total Users: ${stats.totalUsers}`);
        console.log(`Playing: ${stats.playing}`);
        console.log(`Loading: ${stats.loading}`);
        console.log(`Idle: ${stats.idle}`);
        console.log(`Total Queued Items: ${stats.totalQueued}`);
        console.log(`Avg Queue Length: ${stats.avgQueueLength}`);

        // Final verdict
        console.log('\n');
        console.log('═'.repeat(70));
        console.log('  FINAL VERDICT');
        console.log('═'.repeat(70));

        if (testResults.failed === 0) {
            console.log('✅ ALL TESTS PASSED');
            console.log('   System is production-ready');
        } else if (testResults.failed <= 2) {
            console.log('⚠️  MINOR ISSUES');
            console.log('   Most tests passed, minor fixes needed');
        } else {
            console.log('❌ CRITICAL ISSUES');
            console.log('   Multiple tests failed, system needs fixes');
        }

        console.log('\n✅ Tests completed.');

        process.exit(testResults.failed > 0 ? 1 : 0);

    } catch (error) {
        console.error('\n❌ FATAL ERROR:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

runAllTests();
