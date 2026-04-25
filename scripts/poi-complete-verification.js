/**
 * POI COMPLETE SAFETY VERIFICATION RUNNER
 *
 * Orchestrates all verification checks and generates final report.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Poi = require('../src/models/poi.model');

// Import verification modules
const {
    checkBackwardCompatibility,
    checkConcurrencySafety,
    checkSystemFlow,
    checkPerformance
} = require('./poi-safety-verification-extended');

// Vietnam boundaries
const VIETNAM_BOUNDS = {
    minLat: 8.5,
    maxLat: 23.4,
    minLng: 102.1,
    maxLng: 114.0
};

// Complete verification results
const verification = {
    timestamp: new Date().toISOString(),
    categories: {
        dataIntegrity: { status: 'PENDING', checks: [], issues: [] },
        geoCorrectness: { status: 'PENDING', checks: [], issues: [] },
        indexPerformance: { status: 'PENDING', checks: [], issues: [] },
        backwardCompatibility: { status: 'PENDING', checks: [], issues: [] },
        concurrencySafety: { status: 'PENDING', checks: [], issues: [] },
        systemFlow: { status: 'PENDING', checks: [], issues: [] },
        performance: { status: 'PENDING', checks: [], issues: [], metrics: {} }
    },
    finalVerdict: 'PENDING',
    criticalIssues: [],
    warnings: [],
    minorIssues: [],
    riskAssessment: {
        dataLoss: 'UNKNOWN',
        runtime: 'UNKNOWN',
        scaling: 'UNKNOWN'
    }
};

/**
 * STEP 1: DATA INTEGRITY CHECK
 */
async function checkDataIntegrity() {
    console.log('\n========================================');
    console.log('STEP 1: DATA INTEGRITY CHECK');
    console.log('========================================\n');

    const category = verification.categories.dataIntegrity;

    // Check 1.1: Required fields
    console.log('Check 1.1: Required fields validation...');
    const requiredFields = ['code', 'location', 'radius', 'name', 'languageCode', 'status'];
    const totalPois = await Poi.countDocuments({});
    console.log(`   Total POIs: ${totalPois}`);

    for (const field of requiredFields) {
        const missingCount = await Poi.countDocuments({
            $or: [
                { [field]: { $exists: false } },
                { [field]: null },
                ...(field === 'name' || field === 'code' ? [{ [field]: '' }] : [])
            ]
        });

        category.checks.push({
            name: `Required field: ${field}`,
            expected: 0,
            actual: missingCount,
            passed: missingCount === 0
        });

        if (missingCount > 0) {
            const issue = `${missingCount} POIs missing required field: ${field}`;
            category.issues.push(issue);
            verification.criticalIssues.push(issue);
            console.log(`   ❌ FAIL: ${issue}`);
        } else {
            console.log(`   ✅ PASS: All POIs have ${field}`);
        }
    }

    // Check 1.2: Code uniqueness
    console.log('\nCheck 1.2: Code uniqueness...');
    const duplicateCodes = await Poi.aggregate([
        { $group: { _id: '$code', count: { $sum: 1 }, ids: { $push: '$_id' } } },
        { $match: { count: { $gt: 1 } } }
    ]);

    category.checks.push({
        name: 'Code uniqueness',
        expected: 0,
        actual: duplicateCodes.length,
        passed: duplicateCodes.length === 0
    });

    if (duplicateCodes.length > 0) {
        const issue = `Found ${duplicateCodes.length} duplicate codes`;
        category.issues.push(issue);
        verification.criticalIssues.push(issue);
        console.log(`   ❌ FAIL: ${issue}`);
    } else {
        console.log(`   ✅ PASS: All codes are unique`);
    }

    // Check 1.3: Legacy fields cleanup
    console.log('\nCheck 1.3: Legacy fields cleanup...');
    const contentNotNull = await Poi.countDocuments({ content: { $ne: null } });

    category.checks.push({
        name: 'Content field is null',
        expected: 0,
        actual: contentNotNull,
        passed: contentNotNull === 0
    });

    if (contentNotNull > 0) {
        const issue = `${contentNotNull} POIs have non-null content field`;
        category.issues.push(issue);
        verification.warnings.push(issue);
        console.log(`   ⚠️  WARNING: ${issue}`);
    } else {
        console.log(`   ✅ PASS: All content fields are null`);
    }

    category.status = verification.criticalIssues.some(i => category.issues.includes(i)) ? 'FAIL' :
                     category.issues.length > 0 ? 'WARNING' : 'PASS';
    console.log(`\n   Category Status: ${category.status}`);
}

/**
 * STEP 2: GEO CORRECTNESS CHECK
 */
async function checkGeoCorrectness() {
    console.log('\n========================================');
    console.log('STEP 2: GEO CORRECTNESS CHECK');
    console.log('========================================\n');

    const category = verification.categories.geoCorrectness;

    // Check 2.1: GeoJSON format
    console.log('Check 2.1: GeoJSON format validation...');

    const invalidType = await Poi.countDocuments({ 'location.type': { $ne: 'Point' } });
    category.checks.push({
        name: 'GeoJSON type is "Point"',
        expected: 0,
        actual: invalidType,
        passed: invalidType === 0
    });

    if (invalidType > 0) {
        const issue = `${invalidType} POIs have invalid location.type`;
        category.issues.push(issue);
        verification.criticalIssues.push(issue);
        console.log(`   ❌ FAIL: ${issue}`);
    } else {
        console.log(`   ✅ PASS: All locations have type "Point"`);
    }

    // Check 2.2: Coordinate validation
    console.log('\nCheck 2.2: Coordinate validation...');

    const allPois = await Poi.find({}).lean();
    let outOfBounds = 0;
    const outOfBoundsPois = [];

    allPois.forEach(poi => {
        if (poi.location?.coordinates) {
            const [lng, lat] = poi.location.coordinates;

            if (lat < VIETNAM_BOUNDS.minLat || lat > VIETNAM_BOUNDS.maxLat ||
                lng < VIETNAM_BOUNDS.minLng || lng > VIETNAM_BOUNDS.maxLng) {
                outOfBounds++;
                outOfBoundsPois.push({ code: poi.code, coords: [lng, lat] });
            }
        }
    });

    category.checks.push({
        name: 'All POIs within Vietnam boundaries',
        expected: 0,
        actual: outOfBounds,
        passed: outOfBounds === 0
    });

    if (outOfBounds > 0) {
        const issue = `${outOfBounds} POIs outside Vietnam boundaries`;
        category.issues.push(issue);
        verification.criticalIssues.push(issue);
        console.log(`   ❌ FAIL: ${issue}`);
        outOfBoundsPois.slice(0, 3).forEach(poi => {
            console.log(`      ${poi.code}: [${poi.coords[0]}, ${poi.coords[1]}]`);
        });
    } else {
        console.log(`   ✅ PASS: All POIs within Vietnam boundaries`);
    }

    // Check 2.3: Radius validation
    console.log('\nCheck 2.3: Radius validation...');

    const invalidRadius = await Poi.countDocuments({
        $or: [{ radius: { $lte: 0 } }, { radius: { $gt: 100000 } }]
    });

    category.checks.push({
        name: 'Radius in valid range (0, 100000]',
        expected: 0,
        actual: invalidRadius,
        passed: invalidRadius === 0
    });

    if (invalidRadius > 0) {
        const issue = `${invalidRadius} POIs have invalid radius`;
        category.issues.push(issue);
        verification.criticalIssues.push(issue);
        console.log(`   ❌ FAIL: ${issue}`);
    } else {
        console.log(`   ✅ PASS: All radii in valid range`);
    }

    category.status = category.issues.length === 0 ? 'PASS' : 'FAIL';
    console.log(`\n   Category Status: ${category.status}`);
}

/**
 * STEP 3: INDEX VALIDATION
 */
async function checkIndexPerformance() {
    console.log('\n========================================');
    console.log('STEP 3: INDEX PERFORMANCE CHECK');
    console.log('========================================\n');

    const category = verification.categories.indexPerformance;

    // Check 3.1: Index existence
    console.log('Check 3.1: Index existence...');

    const indexes = await Poi.collection.getIndexes();
    console.log('   Current indexes:', Object.keys(indexes));

    // Check for geospatial index
    const hasGeoIndex = Object.values(indexes).some(idx =>
        idx.some(field => field[0] === 'location' && field[1] === '2dsphere')
    );

    category.checks.push({
        name: '2dsphere index on location exists',
        expected: true,
        actual: hasGeoIndex,
        passed: hasGeoIndex
    });

    if (!hasGeoIndex) {
        const issue = 'Missing 2dsphere index on location field';
        category.issues.push(issue);
        verification.criticalIssues.push(issue);
        console.log(`   ❌ FAIL: ${issue}`);
    } else {
        console.log(`   ✅ PASS: 2dsphere geospatial index exists`);
    }

    // Check 3.2: Query execution plan
    if (hasGeoIndex) {
        console.log('\nCheck 3.2: Query execution plan...');

        const explainResult = await Poi.find({
            location: {
                $near: {
                    $geometry: { type: 'Point', coordinates: [105.8542, 21.0285] },
                    $maxDistance: 1000
                }
            }
        }).limit(5).explain('executionStats');

        const execTime = explainResult.executionStats.executionTimeMillis;
        console.log(`   Execution time: ${execTime}ms`);

        category.checks.push({
            name: 'Geo query execution time < 100ms',
            expected: '<100ms',
            actual: `${execTime}ms`,
            passed: execTime < 100
        });

        if (execTime >= 100) {
            const issue = `Geo query too slow: ${execTime}ms`;
            category.issues.push(issue);
            verification.warnings.push(issue);
            console.log(`   ⚠️  WARNING: ${issue}`);
        } else {
            console.log(`   ✅ PASS: Query execution time acceptable`);
        }
    }

    category.status = verification.criticalIssues.some(i => category.issues.includes(i)) ? 'FAIL' :
                     category.issues.length > 0 ? 'WARNING' : 'PASS';
    console.log(`\n   Category Status: ${category.status}`);
}

/**
 * Main verification runner
 */
async function runCompleteVerification() {
    console.log('\n========================================');
    console.log('POI COMPLETE SAFETY VERIFICATION');
    console.log('Phase 1.5 - Production Gatekeeper');
    console.log('========================================');
    console.log(`Timestamp: ${verification.timestamp}`);
    console.log('Engineer: Senior Production Engineer + DBRE\n');

    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGO_URI;
        if (!mongoUri) {
            throw new Error('MONGO_URI environment variable is required');
        }

        console.log('📡 Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✅ Connected\n');

        // Run all verification steps
        await checkDataIntegrity();
        await checkGeoCorrectness();
        await checkIndexPerformance();

        console.log('\n📊 Running extended checks...\n');

        verification.categories.backwardCompatibility = await checkBackwardCompatibility();
        verification.categories.concurrencySafety = await checkConcurrencySafety();
        verification.categories.systemFlow = await checkSystemFlow();
        verification.categories.performance = await checkPerformance();

        // Assess risks
        assessRisks();

        // Determine final verdict
        determineFinalVerdict();

        // Print final report
        printFinalReport();

    } catch (error) {
        console.error('\n❌ VERIFICATION FAILED:', error);
        verification.finalVerdict = 'FAIL';
        verification.criticalIssues.push(`Verification error: ${error.message}`);
    } finally {
        await mongoose.disconnect();
        console.log('\n📡 Disconnected from MongoDB\n');
    }

    return verification;
}

/**
 * Assess risks
 */
function assessRisks() {
    const { criticalIssues, warnings } = verification;

    // Data loss risk
    if (criticalIssues.some(i => i.includes('missing') || i.includes('duplicate'))) {
        verification.riskAssessment.dataLoss = 'HIGH';
    } else if (warnings.length > 0) {
        verification.riskAssessment.dataLoss = 'LOW';
    } else {
        verification.riskAssessment.dataLoss = 'NONE';
    }

    // Runtime risk
    if (criticalIssues.some(i => i.includes('index') || i.includes('query'))) {
        verification.riskAssessment.runtime = 'HIGH';
    } else if (warnings.some(i => i.includes('slow') || i.includes('degradation'))) {
        verification.riskAssessment.runtime = 'MEDIUM';
    } else {
        verification.riskAssessment.runtime = 'LOW';
    }

    // Scaling risk
    const perfCategory = verification.categories.performance;
    if (perfCategory.metrics.degradation > 100) {
        verification.riskAssessment.scaling = 'HIGH';
    } else if (perfCategory.metrics.degradation > 50) {
        verification.riskAssessment.scaling = 'MEDIUM';
    } else {
        verification.riskAssessment.scaling = 'LOW';
    }
}

/**
 * Determine final verdict
 */
function determineFinalVerdict() {
    const categories = Object.values(verification.categories);
    const hasFailures = categories.some(cat => cat.status === 'FAIL');
    const hasWarnings = categories.some(cat => cat.status === 'WARNING');

    if (hasFailures) {
        verification.finalVerdict = 'FAIL';
    } else if (hasWarnings) {
        verification.finalVerdict = 'PASS_WITH_WARNINGS';
    } else {
        verification.finalVerdict = 'PASS';
    }
}

/**
 * Print final report
 */
function printFinalReport() {
    console.log('\n========================================');
    console.log('FINAL VERIFICATION REPORT');
    console.log('========================================\n');

    // Category results
    console.log('📊 CATEGORY RESULTS:\n');
    Object.entries(verification.categories).forEach(([name, cat]) => {
        const icon = cat.status === 'PASS' ? '✅' : cat.status === 'WARNING' ? '⚠️' : '❌';
        console.log(`   ${icon} ${name}: ${cat.status}`);
        console.log(`      Checks: ${cat.checks.length}, Issues: ${cat.issues.length}`);
    });

    // Issues summary
    console.log('\n⚠️  ISSUES SUMMARY:\n');
    console.log(`   Critical: ${verification.criticalIssues.length}`);
    console.log(`   Warnings: ${verification.warnings.length}`);
    console.log(`   Minor: ${verification.minorIssues.length}`);

    if (verification.criticalIssues.length > 0) {
        console.log('\n❌ CRITICAL ISSUES:\n');
        verification.criticalIssues.forEach((issue, i) => {
            console.log(`   ${i + 1}. ${issue}`);
        });
    }

    if (verification.warnings.length > 0) {
        console.log('\n⚠️  WARNINGS:\n');
        verification.warnings.forEach((issue, i) => {
            console.log(`   ${i + 1}. ${issue}`);
        });
    }

    // Risk assessment
    console.log('\n🎯 RISK ASSESSMENT:\n');
    console.log(`   Data Loss Risk: ${verification.riskAssessment.dataLoss}`);
    console.log(`   Runtime Risk: ${verification.riskAssessment.runtime}`);
    console.log(`   Scaling Risk: ${verification.riskAssessment.scaling}`);

    // Performance metrics
    const perfMetrics = verification.categories.performance.metrics;
    if (Object.keys(perfMetrics).length > 0) {
        console.log('\n📈 PERFORMANCE METRICS:\n');
        console.log(`   Single Query Avg: ${perfMetrics.singleQueryAvg?.toFixed(2)}ms`);
        console.log(`   Single Query P95: ${perfMetrics.singleQueryP95}ms`);
        console.log(`   Concurrent Avg: ${perfMetrics.concurrentAvg?.toFixed(2)}ms`);
        console.log(`   Performance Degradation: ${perfMetrics.degradation?.toFixed(1)}%`);
    }

    // Final verdict
    console.log('\n========================================');
    console.log('FINAL VERDICT');
    console.log('========================================\n');

    const verdictIcon = verification.finalVerdict === 'PASS' ? '✅' :
                       verification.finalVerdict === 'PASS_WITH_WARNINGS' ? '⚠️' : '❌';

    console.log(`   ${verdictIcon} ${verification.finalVerdict}\n`);

    if (verification.finalVerdict === 'PASS') {
        console.log('   ✅ System is SAFE for Phase 2 migration.');
        console.log('   ✅ All checks passed.');
        console.log('   ✅ Production ready.\n');
    } else if (verification.finalVerdict === 'PASS_WITH_WARNINGS') {
        console.log('   ⚠️  System is SAFE for Phase 2 with warnings.');
        console.log('   ⚠️  Review warnings and address if necessary.');
        console.log('   ⚠️  Monitor closely in production.\n');
    } else {
        console.log('   ❌ System is NOT SAFE for Phase 2.');
        console.log('   ❌ CRITICAL issues must be fixed before proceeding.');
        console.log('   ❌ DO NOT deploy to production.\n');
    }

    // Required fixes
    if (verification.finalVerdict === 'FAIL') {
        console.log('========================================');
        console.log('REQUIRED FIXES');
        console.log('========================================\n');

        verification.criticalIssues.forEach((issue, i) => {
            console.log(`${i + 1}. ${issue}`);

            // Provide fix suggestions
            if (issue.includes('out of bounds')) {
                console.log('   Fix: Run poi-migration-fix.js to correct coordinates\n');
            } else if (issue.includes('duplicate')) {
                console.log('   Fix: Run deduplication script or manually merge duplicates\n');
            } else if (issue.includes('missing')) {
                console.log('   Fix: Set default values or remove invalid POIs\n');
            } else if (issue.includes('index')) {
                console.log('   Fix: Create missing indexes using provided commands\n');
            }
        });
    }

    console.log('========================================\n');
}

// Run complete verification
runCompleteVerification().then(result => {
    process.exit(result.finalVerdict === 'FAIL' ? 1 : 0);
});
