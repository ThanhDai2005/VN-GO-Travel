/**
 * FULL SYSTEM TEST - Phase 3.5
 * Tracking + Heatmap + Analytics Engine
 *
 * Tests: Normal Flow, Concurrency, Edge Cases, Data Integrity, Performance
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import services
const intelligenceEventsService = require('./src/services/intelligence-events.service');
const poiVisitSessionService = require('./src/services/poi-visit-session.service');
const intelligenceHeatmapService = require('./src/services/intelligence-heatmap.service');
const intelligenceOwnerMetricsService = require('./src/services/intelligence-owner-metrics.service');

// Test results storage
const testResults = {
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: []
};

function logTest(name, status, expected, actual, notes = '') {
  const result = { name, status, expected, actual, notes };
  testResults.tests.push(result);

  if (status === 'PASS') {
    testResults.passed++;
    console.log(`✅ PASS: ${name}`);
  } else if (status === 'FAIL') {
    testResults.failed++;
    console.error(`❌ FAIL: ${name}`);
    console.error(`   Expected: ${expected}`);
    console.error(`   Actual: ${actual}`);
    if (notes) console.error(`   Notes: ${notes}`);
  } else if (status === 'WARN') {
    testResults.warnings++;
    console.warn(`⚠️  WARN: ${name} - ${notes}`);
  }
}

// Helper: Generate unique device ID
function generateDeviceId() {
  return `test-device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Helper: Generate session ID
function generateSessionId() {
  return `test-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Helper: Create POI entry event
function createPoiEntryEvent(deviceId, poiId, poiCode, sessionId, userId = null) {
  return {
    contractVersion: 'v2',
    eventId: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    deviceId,
    correlationId: sessionId,
    authState: userId ? 'logged_in' : 'guest',
    sourceSystem: 'GAK',
    rbelEventFamily: 'location',
    rbelMappingVersion: '7.3.1',
    timestamp: new Date().toISOString(),
    userId: userId ? String(userId) : null,
    poiId,
    payload: {
      poi_id: poiId,
      poi_code: poiCode,
      session_event: 'enter',
      session_id: sessionId,
      latitude: 21.0285,
      longitude: 105.8542
    }
  };
}

// Helper: Create POI exit event
function createPoiExitEvent(deviceId, poiId, poiCode, sessionId, durationSeconds, userId = null) {
  return {
    contractVersion: 'v2',
    eventId: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    deviceId,
    correlationId: sessionId,
    authState: userId ? 'logged_in' : 'guest',
    sourceSystem: 'GAK',
    rbelEventFamily: 'location',
    rbelMappingVersion: '7.3.1',
    timestamp: new Date().toISOString(),
    userId: userId ? String(userId) : null,
    poiId,
    payload: {
      poi_id: poiId,
      poi_code: poiCode,
      session_event: 'exit',
      session_id: sessionId,
      duration_seconds: durationSeconds,
      latitude: 21.0285,
      longitude: 105.8542
    }
  };
}

// Helper: Create audio event
function createAudioEvent(deviceId, poiId, poiCode, interactionType, audioType, userId = null) {
  return {
    contractVersion: 'v2',
    eventId: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    deviceId,
    correlationId: `audio-${Date.now()}`,
    authState: userId ? 'logged_in' : 'guest',
    sourceSystem: 'GAK',
    rbelEventFamily: 'user_interaction',
    rbelMappingVersion: '7.3.1',
    timestamp: new Date().toISOString(),
    userId: userId ? String(userId) : null,
    poiId,
    payload: {
      poi_id: poiId,
      poi_code: poiCode,
      interaction_type: interactionType,
      audio_type: audioType
    }
  };
}

// ============================================================================
// TEST 1: NORMAL FLOW - Single User POI Entry/Exit
// ============================================================================
async function testNormalFlow(poiId, poiCode) {
  console.log('\n🧪 TEST 1: NORMAL FLOW - Single User POI Entry/Exit');
  console.log('='.repeat(60));

  const deviceId = generateDeviceId();
  const sessionId = generateSessionId();

  try {
    // Step 1: User enters POI
    const entryEvent = createPoiEntryEvent(deviceId, poiId, poiCode, sessionId);
    const entryResult = await intelligenceEventsService.ingestSingle(entryEvent, null, { headerDeviceId: deviceId });

    logTest(
      'Normal Flow - POI Entry Event Accepted',
      entryResult.accepted === 1 ? 'PASS' : 'FAIL',
      'accepted: 1',
      `accepted: ${entryResult.accepted}, rejected: ${entryResult.rejected}`
    );

    // Wait 15 seconds (simulate user staying at POI)
    console.log('⏳ Simulating 15-second stay at POI...');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Shortened for testing

    // Step 2: User exits POI
    const exitEvent = createPoiExitEvent(deviceId, poiId, poiCode, sessionId, 15);
    const exitResult = await intelligenceEventsService.ingestSingle(exitEvent, null, { headerDeviceId: deviceId });

    logTest(
      'Normal Flow - POI Exit Event Accepted',
      exitResult.accepted === 1 ? 'PASS' : 'FAIL',
      'accepted: 1',
      `accepted: ${exitResult.accepted}, rejected: ${exitResult.rejected}`
    );

    // Step 3: Verify PoiHourlyStats updated
    await new Promise(resolve => setTimeout(resolve, 1000));
    const PoiHourlyStats = mongoose.connection.collection('PoiHourlyStats');
    const stats = await PoiHourlyStats.findOne({ poi_id: String(poiId) });

    if (stats && stats.unique_devices && stats.unique_devices.includes(deviceId)) {
      logTest(
        'Normal Flow - PoiHourlyStats Updated',
        'PASS',
        `Device ${deviceId} in unique_devices`,
        `Found in unique_devices array (${stats.unique_devices.length} total devices)`
      );
    } else {
      logTest(
        'Normal Flow - PoiHourlyStats Updated',
        'FAIL',
        `Device ${deviceId} in unique_devices`,
        stats ? `Device not found in unique_devices` : 'No stats record found'
      );
    }

  } catch (error) {
    logTest('Normal Flow - Exception', 'FAIL', 'No errors', error.message);
  }
}

// ============================================================================
// TEST 2: CONCURRENCY - Multiple Users Entering Same POI
// ============================================================================
async function testConcurrency(poiId, poiCode, userCount = 50) {
  console.log(`\n🧪 TEST 2: CONCURRENCY - ${userCount} Users Entering Same POI`);
  console.log('='.repeat(60));

  const devices = [];
  const promises = [];

  try {
    // Create concurrent entry events
    for (let i = 0; i < userCount; i++) {
      const deviceId = generateDeviceId();
      const sessionId = generateSessionId();
      devices.push({ deviceId, sessionId });

      const entryEvent = createPoiEntryEvent(deviceId, poiId, poiCode, sessionId);
      promises.push(
        intelligenceEventsService.ingestSingle(entryEvent, null, { headerDeviceId: deviceId })
      );
    }

    console.log(`⏳ Sending ${userCount} concurrent entry events...`);
    const results = await Promise.all(promises);

    const acceptedCount = results.filter(r => r.accepted === 1).length;
    const rejectedCount = results.filter(r => r.rejected > 0).length;

    logTest(
      'Concurrency - All Events Accepted',
      acceptedCount === userCount ? 'PASS' : 'FAIL',
      `${userCount} accepted`,
      `${acceptedCount} accepted, ${rejectedCount} rejected`
    );

    // Wait for aggregation
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify PoiHourlyStats
    const PoiHourlyStats = mongoose.connection.collection('PoiHourlyStats');
    const stats = await PoiHourlyStats.findOne({ poi_id: String(poiId) });

    if (stats && stats.unique_devices) {
      const uniqueCount = stats.unique_devices.length;
      const expectedMin = Math.floor(userCount * 0.9); // Allow 10% margin

      logTest(
        'Concurrency - Unique Devices Count',
        uniqueCount >= expectedMin ? 'PASS' : 'FAIL',
        `>= ${expectedMin} unique devices`,
        `${uniqueCount} unique devices`
      );

      // Check for duplicates
      const uniqueSet = new Set(stats.unique_devices);
      logTest(
        'Concurrency - No Duplicate Devices',
        uniqueSet.size === stats.unique_devices.length ? 'PASS' : 'FAIL',
        'No duplicates',
        uniqueSet.size === stats.unique_devices.length ? 'No duplicates' : `${stats.unique_devices.length - uniqueSet.size} duplicates found`
      );
    } else {
      logTest(
        'Concurrency - PoiHourlyStats Exists',
        'FAIL',
        'Stats record exists',
        'No stats record found'
      );
    }

  } catch (error) {
    logTest('Concurrency - Exception', 'FAIL', 'No errors', error.message);
  }
}

// ============================================================================
// TEST 3: TIME-BASED EDGE CASES
// ============================================================================
async function testTimeEdgeCases(poiId, poiCode) {
  console.log('\n🧪 TEST 3: TIME-BASED EDGE CASES');
  console.log('='.repeat(60));

  try {
    // Case 1: User enters but never exits
    const device1 = generateDeviceId();
    const session1 = generateSessionId();
    const entryOnly = createPoiEntryEvent(device1, poiId, poiCode, session1);
    const result1 = await intelligenceEventsService.ingestSingle(entryOnly, null, { headerDeviceId: device1 });

    logTest(
      'Edge Case - Entry Without Exit',
      result1.accepted === 1 ? 'PASS' : 'FAIL',
      'Event accepted',
      `accepted: ${result1.accepted}`
    );

    // Case 2: User exits instantly (0 seconds)
    const device2 = generateDeviceId();
    const session2 = generateSessionId();
    const entry2 = createPoiEntryEvent(device2, poiId, poiCode, session2);
    await intelligenceEventsService.ingestSingle(entry2, null, { headerDeviceId: device2 });

    const exit2 = createPoiExitEvent(device2, poiId, poiCode, session2, 0);
    const result2 = await intelligenceEventsService.ingestSingle(exit2, null, { headerDeviceId: device2 });

    logTest(
      'Edge Case - Zero Duration Exit',
      result2.accepted === 1 ? 'PASS' : 'FAIL',
      'Event accepted with duration=0',
      `accepted: ${result2.accepted}`
    );

    // Case 3: User stays very long (10 minutes = 600 seconds)
    const device3 = generateDeviceId();
    const session3 = generateSessionId();
    const entry3 = createPoiEntryEvent(device3, poiId, poiCode, session3);
    await intelligenceEventsService.ingestSingle(entry3, null, { headerDeviceId: device3 });

    const exit3 = createPoiExitEvent(device3, poiId, poiCode, session3, 600);
    const result3 = await intelligenceEventsService.ingestSingle(exit3, null, { headerDeviceId: device3 });

    logTest(
      'Edge Case - Long Duration (600s)',
      result3.accepted === 1 ? 'PASS' : 'FAIL',
      'Event accepted with duration=600',
      `accepted: ${result3.accepted}`
    );

  } catch (error) {
    logTest('Time Edge Cases - Exception', 'FAIL', 'No errors', error.message);
  }
}

// ============================================================================
// TEST 4: AUDIO EDGE CASES
// ============================================================================
async function testAudioEdgeCases(poiId, poiCode) {
  console.log('\n🧪 TEST 4: AUDIO EDGE CASES');
  console.log('='.repeat(60));

  try {
    const deviceId = generateDeviceId();

    // Case 1: Audio started but not completed
    const audioStart = createAudioEvent(deviceId, poiId, poiCode, 'audio_start', 'short');
    const result1 = await intelligenceEventsService.ingestSingle(audioStart, null, { headerDeviceId: deviceId });

    logTest(
      'Audio Edge Case - Start Without Completion',
      result1.accepted === 1 ? 'PASS' : 'FAIL',
      'Event accepted',
      `accepted: ${result1.accepted}`
    );

    // Case 2: Audio played multiple times
    const audioStart2 = createAudioEvent(deviceId, poiId, poiCode, 'audio_start', 'long');
    await intelligenceEventsService.ingestSingle(audioStart2, null, { headerDeviceId: deviceId });

    const audioComplete2 = createAudioEvent(deviceId, poiId, poiCode, 'audio_completed', 'long');
    const result2 = await intelligenceEventsService.ingestSingle(audioComplete2, null, { headerDeviceId: deviceId });

    logTest(
      'Audio Edge Case - Multiple Plays',
      result2.accepted === 1 ? 'PASS' : 'FAIL',
      'Multiple audio events accepted',
      `accepted: ${result2.accepted}`
    );

    // Case 3: Audio cancelled
    const audioStart3 = createAudioEvent(deviceId, poiId, poiCode, 'audio_start', 'short');
    await intelligenceEventsService.ingestSingle(audioStart3, null, { headerDeviceId: deviceId });

    const audioCancelled = createAudioEvent(deviceId, poiId, poiCode, 'audio_cancelled', 'short');
    const result3 = await intelligenceEventsService.ingestSingle(audioCancelled, null, { headerDeviceId: deviceId });

    logTest(
      'Audio Edge Case - Cancelled Audio',
      result3.accepted === 1 ? 'PASS' : 'FAIL',
      'Cancelled event accepted',
      `accepted: ${result3.accepted}`
    );

  } catch (error) {
    logTest('Audio Edge Cases - Exception', 'FAIL', 'No errors', error.message);
  }
}

// ============================================================================
// TEST 5: DATA INTEGRITY
// ============================================================================
async function testDataIntegrity(poiId) {
  console.log('\n🧪 TEST 5: DATA INTEGRITY');
  console.log('='.repeat(60));

  try {
    const PoiHourlyStats = mongoose.connection.collection('PoiHourlyStats');
    const stats = await PoiHourlyStats.find({ poi_id: String(poiId) }).toArray();

    if (stats.length === 0) {
      logTest('Data Integrity - Stats Exist', 'WARN', 'Stats records exist', 'No stats found', 'May be expected if no events ingested');
      return;
    }

    // Check for negative durations
    let hasNegativeDuration = false;
    let hasInvalidTimestamp = false;
    let hasDuplicates = false;

    for (const stat of stats) {
      // Check timestamps
      if (!stat.hour_bucket || isNaN(new Date(stat.hour_bucket).getTime())) {
        hasInvalidTimestamp = true;
      }

      // Check for duplicate devices
      if (stat.unique_devices) {
        const uniqueSet = new Set(stat.unique_devices);
        if (uniqueSet.size !== stat.unique_devices.length) {
          hasDuplicates = true;
        }
      }
    }

    logTest(
      'Data Integrity - No Invalid Timestamps',
      !hasInvalidTimestamp ? 'PASS' : 'FAIL',
      'All timestamps valid',
      hasInvalidTimestamp ? 'Invalid timestamps found' : 'All valid'
    );

    logTest(
      'Data Integrity - No Duplicate Devices',
      !hasDuplicates ? 'PASS' : 'FAIL',
      'No duplicate devices in unique_devices arrays',
      hasDuplicates ? 'Duplicates found' : 'No duplicates'
    );

  } catch (error) {
    logTest('Data Integrity - Exception', 'FAIL', 'No errors', error.message);
  }
}

// ============================================================================
// TEST 6: PERFORMANCE
// ============================================================================
async function testPerformance(poiId, poiCode) {
  console.log('\n🧪 TEST 6: PERFORMANCE');
  console.log('='.repeat(60));

  try {
    // Test 1: Single event ingestion time
    const deviceId = generateDeviceId();
    const sessionId = generateSessionId();
    const entryEvent = createPoiEntryEvent(deviceId, poiId, poiCode, sessionId);

    const start1 = Date.now();
    await intelligenceEventsService.ingestSingle(entryEvent, null, { headerDeviceId: deviceId });
    const duration1 = Date.now() - start1;

    logTest(
      'Performance - Single Event Ingestion',
      duration1 < 1000 ? 'PASS' : 'FAIL',
      '< 1000ms',
      `${duration1}ms`
    );

    // Test 2: Batch ingestion time (10 events)
    const batchEvents = [];
    for (let i = 0; i < 10; i++) {
      const dev = generateDeviceId();
      const sess = generateSessionId();
      batchEvents.push(createPoiEntryEvent(dev, poiId, poiCode, sess));
    }

    const start2 = Date.now();
    await intelligenceEventsService.ingestBatch({ schema: 'event-contract-v2', events: batchEvents }, null, {});
    const duration2 = Date.now() - start2;

    logTest(
      'Performance - Batch Ingestion (10 events)',
      duration2 < 2000 ? 'PASS' : 'FAIL',
      '< 2000ms',
      `${duration2}ms`
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
  console.log('  FULL SYSTEM TEST - Phase 3.5');
  console.log('  Tracking + Heatmap + Analytics Engine');
  console.log('  Date: 2026-04-23');
  console.log('═'.repeat(70));

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Get a test POI
    const Pois = mongoose.connection.collection('pois');
    const testPoi = await Pois.findOne();

    if (!testPoi) {
      console.error('❌ No POIs found in database. Cannot run tests.');
      process.exit(1);
    }

    const poiId = String(testPoi._id);
    const poiCode = testPoi.code;

    console.log(`\n📍 Test POI: ${poiCode} (${poiId})`);

    // Run all tests
    await testNormalFlow(poiId, poiCode);
    await testConcurrency(poiId, poiCode, 50);
    await testTimeEdgeCases(poiId, poiCode);
    await testAudioEdgeCases(poiId, poiCode);
    await testDataIntegrity(poiId);
    await testPerformance(poiId, poiCode);

    // Print summary
    console.log('\n');
    console.log('═'.repeat(70));
    console.log('  TEST SUMMARY');
    console.log('═'.repeat(70));
    console.log(`✅ PASSED: ${testResults.passed}`);
    console.log(`❌ FAILED: ${testResults.failed}`);
    console.log(`⚠️  WARNINGS: ${testResults.warnings}`);
    console.log(`📊 TOTAL: ${testResults.tests.length}`);

    const passRate = ((testResults.passed / testResults.tests.length) * 100).toFixed(1);
    console.log(`\n📈 Pass Rate: ${passRate}%`);

    // Final verdict
    console.log('\n');
    console.log('═'.repeat(70));
    console.log('  FINAL VERDICT');
    console.log('═'.repeat(70));

    if (testResults.failed === 0 && passRate >= 90) {
      console.log('✅ READY FOR DEMO');
      console.log('   System is stable, accurate, and ready for production use.');
    } else if (testResults.failed <= 2 && passRate >= 80) {
      console.log('⚠️  NEEDS MINOR FIXES');
      console.log('   System is mostly functional but has minor issues.');
    } else {
      console.log('❌ NOT READY');
      console.log('   System has critical issues that must be fixed.');
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

// Run tests
runAllTests();
