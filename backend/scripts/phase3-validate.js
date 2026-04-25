/**
 * PHASE 3: VALIDATION SCRIPT
 *
 * Validates Phase 3 analytics integration by checking:
 * - Identity edges collection and indexes
 * - Audio event integration
 * - Visit session service
 * - Grid-based heatmap
 * - Owner analytics APIs
 * - Route mounting and authentication
 *
 * Run: node scripts/phase3-validate.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const IntelligenceIdentityEdge = require('../src/models/intelligence-identity-edge.model');
const IntelligenceEventRaw = require('../src/models/intelligence-event-raw.model');
const Poi = require('../src/models/poi.model');
const User = require('../src/models/user.model');
const intelligenceEventsService = require('../src/services/intelligence-events.service');
const audioQueueService = require('../src/services/audio-queue.service');
const poiVisitSessionService = require('../src/services/poi-visit-session.service');
const intelligenceHeatmapService = require('../src/services/intelligence-heatmap.service');
const intelligenceOwnerMetricsService = require('../src/services/intelligence-owner-metrics.service');

const results = {
    timestamp: new Date().toISOString(),
    checks: {
        identityEdges: { status: 'PENDING', issues: [] },
        audioIntegration: { status: 'PENDING', issues: [] },
        visitSessions: { status: 'PENDING', issues: [] },
        gridHeatmap: { status: 'PENDING', issues: [] },
        ownerAnalytics: { status: 'PENDING', issues: [] },
        routeMounting: { status: 'PENDING', issues: [] }
    },
    finalVerdict: 'PENDING',
    errors: []
};

/**
 * Check 1: Identity Edges Collection
 */
async function checkIdentityEdges() {
    console.log('\n========================================');
    console.log('CHECK 1: IDENTITY EDGES');
    console.log('========================================\n');

    const check = results.checks.identityEdges;

    try {
        // Verify collection exists
        const collections = await mongoose.connection.db.listCollections({ name: 'uis_identity_edges' }).toArray();
        if (collections.length === 0) {
            check.issues.push('Collection uis_identity_edges does not exist');
            console.log('   ❌ Collection not found');
        } else {
            console.log('   ✅ Collection exists');
        }

        // Verify indexes
        const indexes = await IntelligenceIdentityEdge.collection.getIndexes();
        const requiredIndexes = [
            'edge_type_1_from_id_1_to_id_1',
            'to_id_1_established_at_-1',
            'from_id_1_established_at_-1'
        ];

        for (const indexName of requiredIndexes) {
            if (indexes[indexName]) {
                console.log(`   ✅ Index ${indexName} exists`);
            } else {
                check.issues.push(`Missing index: ${indexName}`);
                console.log(`   ❌ Index ${indexName} missing`);
            }
        }

        // Test edge creation
        const testDeviceId = `test-device-${Date.now()}`;
        const testUserId = new mongoose.Types.ObjectId();

        await IntelligenceIdentityEdge.create({
            edge_type: 'device_linked_user',
            from_id: testDeviceId,
            to_id: String(testUserId),
            established_at: new Date(),
            source: 'ingest_jwt',
            confidence: 'high',
            ingestion_request_id: 'test-request'
        });

        console.log('   ✅ Edge creation successful');

        // Test unique constraint
        try {
            await IntelligenceIdentityEdge.create({
                edge_type: 'device_linked_user',
                from_id: testDeviceId,
                to_id: String(testUserId),
                established_at: new Date(),
                source: 'ingest_jwt',
                confidence: 'high',
                ingestion_request_id: 'test-request-2'
            });
            check.issues.push('Unique constraint not enforced');
            console.log('   ❌ Unique constraint not working');
        } catch (error) {
            if (error.code === 11000) {
                console.log('   ✅ Unique constraint enforced');
            } else {
                throw error;
            }
        }

        // Cleanup
        await IntelligenceIdentityEdge.deleteMany({ from_id: testDeviceId });

        check.status = check.issues.length === 0 ? 'PASS' : 'FAIL';

    } catch (error) {
        check.issues.push(`Error: ${error.message}`);
        check.status = 'FAIL';
        console.error('   ❌ Error:', error.message);
    }
}

/**
 * Check 2: Audio Event Integration
 */
async function checkAudioIntegration() {
    console.log('\n========================================');
    console.log('CHECK 2: AUDIO EVENT INTEGRATION');
    console.log('========================================\n');

    const check = results.checks.audioIntegration;

    try {
        // Verify _sendAudioEventToIntelligence method exists
        if (typeof audioQueueService._sendAudioEventToIntelligence === 'function') {
            console.log('   ✅ Audio event sending method exists');
        } else {
            check.issues.push('_sendAudioEventToIntelligence method not found');
            console.log('   ❌ Audio event sending method missing');
        }

        // Test audio event structure
        const testPoi = await Poi.findOne({}).lean();
        if (!testPoi) {
            check.issues.push('No POI found for testing');
            check.status = 'SKIP';
            return;
        }

        const testDeviceId = `test-audio-device-${Date.now()}`;
        const testEvent = {
            contractVersion: 'v2',
            deviceId: testDeviceId,
            correlationId: `audio-test-${Date.now()}`,
            authState: 'guest',
            sourceSystem: 'GAK',
            rbelEventFamily: 'user_interaction',
            rbelMappingVersion: '7.3.1',
            timestamp: new Date().toISOString(),
            userId: null,
            poiId: String(testPoi._id),
            payload: {
                interaction_type: 'audio_start',
                audio_type: 'short',
                duration_seconds: 0,
                queue_position: 0,
                language: 'vi'
            }
        };

        // Ingest test audio event
        await intelligenceEventsService.ingestSingle(testEvent, null, { headerDeviceId: testDeviceId });
        console.log('   ✅ Audio event ingestion successful');

        // Verify event in database
        const savedEvent = await IntelligenceEventRaw.findOne({
            device_id: testDeviceId,
            event_family: 'UserInteractionEvent',
            'payload.interaction_type': 'audio_start'
        }).lean();

        if (savedEvent) {
            console.log('   ✅ Audio event saved in uis_events_raw');

            // Verify payload structure
            if (savedEvent.payload.audio_type === 'short' &&
                savedEvent.payload.queue_position === 0 &&
                savedEvent.payload.language === 'vi') {
                console.log('   ✅ Audio event payload correct');
            } else {
                check.issues.push('Audio event payload structure incorrect');
                console.log('   ❌ Audio event payload incorrect');
            }
        } else {
            check.issues.push('Audio event not found in database');
            console.log('   ❌ Audio event not saved');
        }

        // Cleanup
        await IntelligenceEventRaw.deleteMany({ device_id: testDeviceId });

        check.status = check.issues.length === 0 ? 'PASS' : 'FAIL';

    } catch (error) {
        check.issues.push(`Error: ${error.message}`);
        check.status = 'FAIL';
        console.error('   ❌ Error:', error.message);
    }
}

/**
 * Check 3: Visit Session Service
 */
async function checkVisitSessions() {
    console.log('\n========================================');
    console.log('CHECK 3: VISIT SESSION SERVICE');
    console.log('========================================\n');

    const check = results.checks.visitSessions;

    try {
        // Verify service methods exist
        if (typeof poiVisitSessionService.recordEnter === 'function' &&
            typeof poiVisitSessionService.recordExit === 'function') {
            console.log('   ✅ Visit session service methods exist');
        } else {
            check.issues.push('Visit session service methods missing');
            console.log('   ❌ Visit session service methods missing');
        }

        const testPoi = await Poi.findOne({}).lean();
        if (!testPoi) {
            check.issues.push('No POI found for testing');
            check.status = 'SKIP';
            return;
        }

        const testDeviceId = `test-visit-device-${Date.now()}`;
        const testSessionId = `session-${Date.now()}`;

        // Test enter event
        await poiVisitSessionService.recordEnter(
            testDeviceId,
            null,
            String(testPoi._id),
            testPoi.code,
            testSessionId
        );
        console.log('   ✅ Enter event recorded');

        // Verify enter event in database
        const enterEvent = await IntelligenceEventRaw.findOne({
            device_id: testDeviceId,
            event_family: 'LocationEvent',
            'payload.session_event': 'enter',
            'payload.session_id': testSessionId
        }).lean();

        if (enterEvent) {
            console.log('   ✅ Enter event saved in uis_events_raw');
        } else {
            check.issues.push('Enter event not found in database');
            console.log('   ❌ Enter event not saved');
        }

        // Test exit event
        await poiVisitSessionService.recordExit(
            testDeviceId,
            null,
            String(testPoi._id),
            testPoi.code,
            testSessionId,
            300
        );
        console.log('   ✅ Exit event recorded');

        // Verify exit event in database
        const exitEvent = await IntelligenceEventRaw.findOne({
            device_id: testDeviceId,
            event_family: 'LocationEvent',
            'payload.session_event': 'exit',
            'payload.session_id': testSessionId
        }).lean();

        if (exitEvent) {
            console.log('   ✅ Exit event saved in uis_events_raw');

            if (exitEvent.payload.duration_seconds === 300) {
                console.log('   ✅ Duration recorded correctly');
            } else {
                check.issues.push('Duration not recorded correctly');
                console.log('   ❌ Duration incorrect');
            }
        } else {
            check.issues.push('Exit event not found in database');
            console.log('   ❌ Exit event not saved');
        }

        // Cleanup
        await IntelligenceEventRaw.deleteMany({ device_id: testDeviceId });

        check.status = check.issues.length === 0 ? 'PASS' : 'FAIL';

    } catch (error) {
        check.issues.push(`Error: ${error.message}`);
        check.status = 'FAIL';
        console.error('   ❌ Error:', error.message);
    }
}

/**
 * Check 4: Grid-Based Heatmap
 */
async function checkGridHeatmap() {
    console.log('\n========================================');
    console.log('CHECK 4: GRID-BASED HEATMAP');
    console.log('========================================\n');

    const check = results.checks.gridHeatmap;

    try {
        // Verify grid functions exist
        if (typeof intelligenceHeatmapService.getGridHeatmap === 'function' &&
            typeof intelligenceHeatmapService.getGridCell === 'function') {
            console.log('   ✅ Grid heatmap functions exist');
        } else {
            check.issues.push('Grid heatmap functions missing');
            console.log('   ❌ Grid heatmap functions missing');
        }

        // Test grid cell calculation
        const cell = intelligenceHeatmapService.getGridCell(21.0285, 105.8542);

        if (cell.cell_key && cell.cell_center_lat && cell.cell_center_lon) {
            console.log('   ✅ Grid cell calculation works');
            console.log(`      Cell: ${cell.cell_key} at (${cell.cell_center_lat}, ${cell.cell_center_lon})`);
        } else {
            check.issues.push('Grid cell calculation failed');
            console.log('   ❌ Grid cell calculation failed');
        }

        // Verify grid size
        if (intelligenceHeatmapService.GRID_SIZE === 0.01) {
            console.log('   ✅ Grid size correct (0.01°)');
        } else {
            check.issues.push('Grid size incorrect');
            console.log('   ❌ Grid size incorrect');
        }

        // Verify 24-hour constraint
        if (intelligenceHeatmapService.GRID_HEATMAP_MAX_HOURS === 24) {
            console.log('   ✅ 24-hour constraint configured');
        } else {
            check.issues.push('24-hour constraint not configured');
            console.log('   ❌ 24-hour constraint missing');
        }

        // Test grid heatmap query (should work even with no data)
        const now = new Date();
        const yesterday = new Date(now.getTime() - 23 * 60 * 60 * 1000);

        const gridData = await intelligenceHeatmapService.getGridHeatmap(yesterday, now);
        console.log(`   ✅ Grid heatmap query successful (${gridData.length} cells)`);

        // Verify no PII in response
        if (gridData.length > 0) {
            const sample = gridData[0];
            if (!sample.device_id && !sample.user_id && sample.cell_key && sample.weight !== undefined) {
                console.log('   ✅ No PII in grid heatmap response');
            } else {
                check.issues.push('PII found in grid heatmap response');
                console.log('   ❌ PII found in response');
            }
        }

        // Test 24-hour constraint enforcement
        try {
            const tooFarBack = new Date(now.getTime() - 25 * 60 * 60 * 1000);
            await intelligenceHeatmapService.getGridHeatmap(tooFarBack, now);
            check.issues.push('24-hour constraint not enforced');
            console.log('   ❌ 24-hour constraint not enforced');
        } catch (error) {
            if (error.message.includes('24 hours')) {
                console.log('   ✅ 24-hour constraint enforced');
            } else {
                throw error;
            }
        }

        check.status = check.issues.length === 0 ? 'PASS' : 'FAIL';

    } catch (error) {
        check.issues.push(`Error: ${error.message}`);
        check.status = 'FAIL';
        console.error('   ❌ Error:', error.message);
    }
}

/**
 * Check 5: Owner Analytics
 */
async function checkOwnerAnalytics() {
    console.log('\n========================================');
    console.log('CHECK 5: OWNER ANALYTICS');
    console.log('========================================\n');

    const check = results.checks.ownerAnalytics;

    try {
        // Verify service methods exist
        const methods = [
            'getPoiVisits',
            'getAudioStats',
            'getVisitDuration',
            'getPoiSummary'
        ];

        for (const method of methods) {
            if (typeof intelligenceOwnerMetricsService[method] === 'function') {
                console.log(`   ✅ Method ${method} exists`);
            } else {
                check.issues.push(`Method ${method} missing`);
                console.log(`   ❌ Method ${method} missing`);
            }
        }

        // Find a POI with owner
        const testPoi = await Poi.findOne({ submittedBy: { $exists: true } }).lean();
        if (!testPoi) {
            console.log('   ⚠️  No POI with owner found, skipping ownership tests');
            check.status = check.issues.length === 0 ? 'PASS' : 'WARNING';
            return;
        }

        const ownerId = testPoi.submittedBy;

        // Test ownership verification (should pass)
        try {
            await intelligenceOwnerMetricsService.getPoiVisits(
                String(testPoi._id),
                String(ownerId),
                null,
                null
            );
            console.log('   ✅ Ownership verification works (authorized)');
        } catch (error) {
            if (error.statusCode === 409) {
                console.log('   ⚠️  POI not approved, skipping authorized test');
            } else {
                throw error;
            }
        }

        // Test ownership verification (should fail)
        const fakeOwnerId = new mongoose.Types.ObjectId();
        try {
            await intelligenceOwnerMetricsService.getPoiVisits(
                String(testPoi._id),
                String(fakeOwnerId),
                null,
                null
            );
            check.issues.push('Ownership verification not enforced');
            console.log('   ❌ Ownership verification not enforced');
        } catch (error) {
            if (error.statusCode === 403) {
                console.log('   ✅ Ownership verification enforced (unauthorized blocked)');
            } else {
                throw error;
            }
        }

        check.status = check.issues.length === 0 ? 'PASS' : 'FAIL';

    } catch (error) {
        check.issues.push(`Error: ${error.message}`);
        check.status = 'FAIL';
        console.error('   ❌ Error:', error.message);
    }
}

/**
 * Check 6: Route Mounting
 */
async function checkRouteMounting() {
    console.log('\n========================================');
    console.log('CHECK 6: ROUTE MOUNTING');
    console.log('========================================\n');

    const check = results.checks.routeMounting;

    try {
        // Check if app.js exists and has intelligence owner routes
        const fs = require('fs');
        const appPath = path.join(__dirname, '../src/app.js');

        if (!fs.existsSync(appPath)) {
            check.issues.push('app.js not found');
            console.log('   ❌ app.js not found');
            check.status = 'FAIL';
            return;
        }

        const appContent = fs.readFileSync(appPath, 'utf8');

        // Check route import
        if (appContent.includes("require('./routes/intelligence-owner.routes')")) {
            console.log('   ✅ Intelligence owner routes imported');
        } else {
            check.issues.push('Intelligence owner routes not imported');
            console.log('   ❌ Intelligence owner routes not imported');
        }

        // Check route mounting
        if (appContent.includes("app.use('/api/v1/owner/intelligence'")) {
            console.log('   ✅ Intelligence owner routes mounted');
        } else {
            check.issues.push('Intelligence owner routes not mounted');
            console.log('   ❌ Intelligence owner routes not mounted');
        }

        // Check controller exists
        const controllerPath = path.join(__dirname, '../src/controllers/intelligence-owner.controller.js');
        if (fs.existsSync(controllerPath)) {
            console.log('   ✅ Intelligence owner controller exists');
        } else {
            check.issues.push('Intelligence owner controller not found');
            console.log('   ❌ Intelligence owner controller not found');
        }

        // Check routes file exists
        const routesPath = path.join(__dirname, '../src/routes/intelligence-owner.routes.js');
        if (fs.existsSync(routesPath)) {
            console.log('   ✅ Intelligence owner routes file exists');
        } else {
            check.issues.push('Intelligence owner routes file not found');
            console.log('   ❌ Intelligence owner routes file not found');
        }

        check.status = check.issues.length === 0 ? 'PASS' : 'FAIL';

    } catch (error) {
        check.issues.push(`Error: ${error.message}`);
        check.status = 'FAIL';
        console.error('   ❌ Error:', error.message);
    }
}

/**
 * Determine final verdict
 */
function determineFinalVerdict() {
    const checks = Object.values(results.checks);
    const hasFail = checks.some(c => c.status === 'FAIL');
    const hasWarning = checks.some(c => c.status === 'WARNING');
    const hasSkip = checks.some(c => c.status === 'SKIP');

    if (hasFail) {
        results.finalVerdict = 'FAIL';
    } else if (hasWarning) {
        results.finalVerdict = 'PASS_WITH_WARNINGS';
    } else if (hasSkip) {
        results.finalVerdict = 'PASS_WITH_SKIPS';
    } else {
        results.finalVerdict = 'PASS';
    }
}

/**
 * Print final report
 */
function printFinalReport() {
    console.log('\n========================================');
    console.log('PHASE 3: VALIDATION REPORT');
    console.log('========================================\n');

    console.log('📊 CHECK RESULTS:\n');
    Object.entries(results.checks).forEach(([name, check]) => {
        const icon = check.status === 'PASS' ? '✅' :
                     check.status === 'WARNING' ? '⚠️' :
                     check.status === 'SKIP' ? '⏭️' : '❌';
        console.log(`   ${icon} ${name}: ${check.status}`);
        if (check.issues && check.issues.length > 0) {
            console.log(`      Issues: ${check.issues.length}`);
        }
    });

    // All issues
    const allIssues = Object.values(results.checks)
        .filter(c => c.issues && Array.isArray(c.issues))
        .flatMap(c => c.issues);

    if (allIssues.length > 0) {
        console.log('\n⚠️  ISSUES:\n');
        allIssues.forEach((issue, i) => {
            console.log(`   ${i + 1}. ${issue}`);
        });
    }

    console.log('\n========================================');
    console.log('FINAL VERDICT');
    console.log('========================================\n');

    const icon = results.finalVerdict === 'PASS' ? '✅' :
                 results.finalVerdict.includes('WARNING') ? '⚠️' :
                 results.finalVerdict.includes('SKIP') ? '⏭️' : '❌';

    console.log(`   ${icon} ${results.finalVerdict}\n`);

    if (results.finalVerdict === 'PASS') {
        console.log('   ✅ Phase 3 validation successful');
        console.log('   ✅ All components working correctly');
        console.log('   ✅ Ready for mobile app integration\n');
    } else if (results.finalVerdict.includes('WARNING') || results.finalVerdict.includes('SKIP')) {
        console.log('   ⚠️  Phase 3 validation passed with warnings/skips');
        console.log('   ⚠️  Review warnings above');
        console.log('   ⚠️  Core functionality working\n');
    } else {
        console.log('   ❌ Phase 3 validation FAILED');
        console.log('   ❌ Fix issues before proceeding');
        console.log('   ❌ DO NOT deploy to production\n');
    }
}

/**
 * Main execution
 */
async function runValidation() {
    console.log('\n========================================');
    console.log('PHASE 3: VALIDATION');
    console.log('========================================');
    console.log(`Timestamp: ${results.timestamp}\n`);

    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGO_URI;
        if (!mongoUri) {
            throw new Error('MONGO_URI environment variable is required');
        }

        console.log('📡 Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✅ Connected\n');

        // Run all checks
        await checkIdentityEdges();
        await checkAudioIntegration();
        await checkVisitSessions();
        await checkGridHeatmap();
        await checkOwnerAnalytics();
        await checkRouteMounting();

        // Determine verdict
        determineFinalVerdict();

        // Print report
        printFinalReport();

    } catch (error) {
        console.error('\n❌ VALIDATION FAILED:', error.message);
        results.errors.push(`Fatal: ${error.message}`);
        results.finalVerdict = 'FAIL';
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('📡 Disconnected from MongoDB\n');
    }
}

// Run validation
runValidation().then(() => {
    process.exit(results.finalVerdict === 'FAIL' ? 1 : 0);
});
