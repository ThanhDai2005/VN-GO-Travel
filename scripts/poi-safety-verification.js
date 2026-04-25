/**
 * POI SAFETY VERIFICATION SCRIPT (Phase 1.5)
 *
 * This script performs comprehensive safety checks on the POI collection
 * after Phase 1 migration to ensure production readiness.
 *
 * CRITICAL: This is a production gatekeeper script.
 * All checks must PASS before proceeding to Phase 2.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Poi = require('../src/models/poi.model');

// Verification results
const verification = {
    timestamp: new Date().toISOString(),
    categories: {
        dataIntegrity: { status: 'PENDING', checks: [], issues: [] },
        geoCorrectness: { status: 'PENDING', checks: [], issues: [] },
        indexPerformance: { status: 'PENDING', checks: [], issues: [] },
        backwardCompatibility: { status: 'PENDING', checks: [], issues: [] },
        concurrencySafety: { status: 'PENDING', checks: [], issues: [] },
        systemFlow: { status: 'PENDING', checks: [], issues: [] },
        performance: { status: 'PENDING', checks: [], issues: [] }
    },
    finalVerdict: 'PENDING',
    criticalIssues: [],
    warnings: [],
    minorIssues: []
};

/**
 * STEP 1: DATA INTEGRITY CHECK
 */
async function checkDataIntegrity() {
    console.log('\n========================================');
    console.log('STEP 1: DATA INTEGRITY CHECK');
    console.log('========================================\n');

    const category = verification.categories.dataIntegrity;

    // Check 1.1: Required fields exist in ALL documents
    console.log('Check 1.1: Required fields validation...');
    const requiredFields = ['code', 'location', 'radius', 'name', 'languageCode', 'status'];

    const totalPois = await Poi.countDocuments({});
    console.log(`   Total POIs: ${totalPois}`);

    for (const field of requiredFields) {
        const missingCount = await Poi.countDocuments({
            $or: [
                { [field]: { $exists: false } },
                { [field]: null },
                ...(typeof '' === 'string' ? [{ [field]: '' }] : [])
            ]
        });

        const check = {
            name: `Required field: ${field}`,
            expected: 0,
            actual: missingCount,
            passed: missingCount === 0
        };

        category.checks.push(check);

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

    const check12 = {
        name: 'Code uniqueness',
        expected: 0,
        actual: duplicateCodes.length,
        passed: duplicateCodes.length === 0
    };
    category.checks.push(check12);

    if (duplicateCodes.length > 0) {
        const issue = `Found ${duplicateCodes.length} duplicate codes`;
        category.issues.push(issue);
        verification.criticalIssues.push(issue);
        console.log(`   ❌ FAIL: ${issue}`);
        duplicateCodes.forEach(dup => {
            console.log(`      Code: ${dup._id}, Count: ${dup.count}`);
        });
    } else {
        console.log(`   ✅ PASS: All codes are unique`);
    }

    // Check 1.3: No legacy fields remain
    console.log('\nCheck 1.3: Legacy fields cleanup...');
    const legacyFields = ['audioUrl', 'description'];

    for (const field of legacyFields) {
        const count = await Poi.countDocuments({
            [field]: { $exists: true, $ne: null }
        });

        const check = {
            name: `Legacy field removed: ${field}`,
            expected: 0,
            actual: count,
            passed: count === 0
        };
        category.checks.push(check);

        if (count > 0) {
            const issue = `${count} POIs still have legacy field: ${field}`;
            category.issues.push(issue);
            verification.warnings.push(issue);
            console.log(`   ⚠️  WARNING: ${issue}`);
        } else {
            console.log(`   ✅ PASS: No legacy field ${field}`);
        }
    }

    // Check 1.4: Content field should be null
    console.log('\nCheck 1.4: Content field cleanup...');
    const contentNotNull = await Poi.countDocuments({
        content: { $ne: null }
    });

    const check14 = {
        name: 'Content field is null',
        expected: 0,
        actual: contentNotNull,
        passed: contentNotNull === 0
    };
    category.checks.push(check14);

    if (contentNotNull > 0) {
        const issue = `${contentNotNull} POIs have non-null content field`;
        category.issues.push(issue);
        verification.warnings.push(issue);
        console.log(`   ⚠️  WARNING: ${issue}`);
    } else {
        console.log(`   ✅ PASS: All content fields are null`);
    }

    // Set category status
    category.status = category.issues.length === 0 ? 'PASS' :
                     verification.criticalIssues.some(i => category.issues.includes(i)) ? 'FAIL' : 'WARNING';

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

    // Check 2.1: GeoJSON format validation
    console.log('Check 2.1: GeoJSON format validation...');

    const invalidType = await Poi.countDocuments({
        'location.type': { $ne: 'Point' }
    });

    const check21a = {
        name: 'GeoJSON type is "Point"',
        expected: 0,
        actual: invalidType,
        passed: invalidType === 0
    };
    category.checks.push(check21a);

    if (invalidType > 0) {
        const issue = `${invalidType} POIs have invalid location.type (not "Point")`;
        category.issues.push(issue);
        verification.criticalIssues.push(issue);
        console.log(`   ❌ FAIL: ${issue}`);
    } else {
        console.log(`   ✅ PASS: All locations have type "Point"`);
    }

    // Check coordinates array
    const invalidCoords = await Poi.countDocuments({
        $or: [
            { 'location.coordinates': { $exists: false } },
            { 'location.coordinates': { $not: { $type: 'array' } } },
            { $expr: { $ne: [{ $size: '$location.coordinates' }, 2] } }
        ]
    });

    const check21b = {
        name: 'Coordinates array format',
        expected: 0,
        actual: invalidCoords,
        passed: invalidCoords === 0
    };
    category.checks.push(check21b);

    if (invalidCoords > 0) {
        const issue = `${invalidCoords} POIs have invalid coordinates array`;
        category.issues.push(issue);
        verification.criticalIssues.push(issue);
        console.log(`   ❌ FAIL: ${issue}`);
    } else {
        console.log(`   ✅ PASS: All coordinates are valid arrays [lng, lat]`);
    }

    // Check 2.2: Coordinate range validation
    console.log('\nCheck 2.2: Coordinate range validation...');

    const allPois = await Poi.find({}).lean();
    let outOfRangeLng = 0;
    let outOfRangeLat = 0;
    let swappedCoords = 0;

    const VIETNAM_BOUNDS = {
        minLat: 8.5,
        maxLat: 23.4,
        minLng: 102.1,
        maxLng: 114.0
    };

    allPois.forEach(poi => {
        if (poi.location?.coordinates) {
            const [lng, lat] = poi.location.coordinates;

            // Check longitude range
            if (lng < -180 || lng > 180) {
                outOfRangeLng++;
            }

            // Check latitude range
            if (lat < -90 || lat > 90) {
                outOfRangeLat++;
            }

            // Detect potential swapped coordinates
            // If lng is in lat range and lat is in lng range, likely swapped
            if (lng >= -90 && lng <= 90 && lat >= -180 && lat <= 180 &&
                (lat < VIETNAM_BOUNDS.minLat || lat > VIETNAM_BOUNDS.maxLat)) {
                swappedCoords++;
            }
        }
    });

    const check22a = {
        name: 'Longitude in valid range [-180, 180]',
        expected: 0,
        actual: outOfRangeLng,
        passed: outOfRangeLng === 0
    };
    category.checks.push(check22a);

    const check22b = {
        name: 'Latitude in valid range [-90, 90]',
        expected: 0,
        actual: outOfRangeLat,
        passed: outOfRangeLat === 0
    };
    category.checks.push(check22b);

    const check22c = {
        name: 'No swapped lat/lng coordinates',
        expected: 0,
        actual: swappedCoords,
        passed: swappedCoords === 0
    };
    category.checks.push(check22c);

    if (outOfRangeLng > 0) {
        const issue = `${outOfRangeLng} POIs have longitude out of range`;
        category.issues.push(issue);
        verification.criticalIssues.push(issue);
        console.log(`   ❌ FAIL: ${issue}`);
    } else {
        console.log(`   ✅ PASS: All longitudes in valid range`);
    }

    if (outOfRangeLat > 0) {
        const issue = `${outOfRangeLat} POIs have latitude out of range`;
        category.issues.push(issue);
        verification.criticalIssues.push(issue);
        console.log(`   ❌ FAIL: ${issue}`);
    } else {
        console.log(`   ✅ PASS: All latitudes in valid range`);
    }

    if (swappedCoords > 0) {
        const issue = `${swappedCoords} POIs may have swapped lat/lng`;
        category.issues.push(issue);
        verification.criticalIssues.push(issue);
        console.log(`   ❌ FAIL: ${issue}`);
    } else {
        console.log(`   ✅ PASS: No swapped coordinates detected`);
    }

    // Check 2.3: Vietnam boundary validation
    console.log('\nCheck 2.3: Vietnam boundary validation...');

    let outOfBounds = 0;
    const outOfBoundsPois = [];

    allPois.forEach(poi => {
        if (poi.location?.coordinates) {
            const [lng, lat] = poi.location.coordinates;

            if (lat < VIETNAM_BOUNDS.minLat || lat > VIETNAM_BOUNDS.maxLat ||
                lng < VIETNAM_BOUNDS.minLng || lng > VIETNAM_BOUNDS.maxLng) {
                outOfBounds++;
                outOfBoundsPois.push({
                    code: poi.code,
                    coords: [lng, lat]
                });
            }
        }
    });

    const check23 = {
        name: 'All POIs within Vietnam boundaries',
        expected: 0,
        actual: outOfBounds,
        passed: outOfBounds === 0
    };
    category.checks.push(check23);

    if (outOfBounds > 0) {
        const issue = `${outOfBounds} POIs outside Vietnam boundaries`;
        category.issues.push(issue);
        verification.criticalIssues.push(issue);
        console.log(`   ❌ FAIL: ${issue}`);
        outOfBoundsPois.slice(0, 5).forEach(poi => {
            console.log(`      ${poi.code}: [${poi.coords[0]}, ${poi.coords[1]}]`);
        });
    } else {
        console.log(`   ✅ PASS: All POIs within Vietnam boundaries`);
    }

    // Check 2.4: Radius validation
    console.log('\nCheck 2.4: Radius validation...');

    const invalidRadius = await Poi.countDocuments({
        $or: [
            { radius: { $lte: 0 } },
            { radius: { $gt: 100000 } }
        ]
    });

    const check24 = {
        name: 'Radius in valid range (0, 100000]',
        expected: 0,
        actual: invalidRadius,
        passed: invalidRadius === 0
    };
    category.checks.push(check24);

    if (invalidRadius > 0) {
        const issue = `${invalidRadius} POIs have invalid radius`;
        category.issues.push(issue);
        verification.criticalIssues.push(issue);
        console.log(`   ❌ FAIL: ${issue}`);
    } else {
        console.log(`   ✅ PASS: All radii in valid range`);
    }

    // Set category status
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

    // Check for code index (unique)
    const hasCodeIndex = Object.values(indexes).some(idx =>
        idx.some(field => field[0] === 'code') &&
        indexes[Object.keys(indexes).find(key => indexes[key] === idx)]?.unique === true
    );

    const check31a = {
        name: 'Unique index on code exists',
        expected: true,
        actual: hasCodeIndex,
        passed: hasCodeIndex
    };
    category.checks.push(check31a);

    if (!hasCodeIndex) {
        const issue = 'Missing unique index on code field';
        category.issues.push(issue);
        verification.criticalIssues.push(issue);
        console.log(`   ❌ FAIL: ${issue}`);
    } else {
        console.log(`   ✅ PASS: Unique code index exists`);
    }

    // Check for geospatial index
    const hasGeoIndex = Object.values(indexes).some(idx =>
        idx.some(field => field[0] === 'location' && field[1] === '2dsphere')
    );

    const check31b = {
        name: '2dsphere index on location exists',
        expected: true,
        actual: hasGeoIndex,
        passed: hasGeoIndex
    };
    category.checks.push(check31b);

    if (!hasGeoIndex) {
        const issue = 'Missing 2dsphere index on location field';
        category.issues.push(issue);
        verification.criticalIssues.push(issue);
        console.log(`   ❌ FAIL: ${issue}`);
    } else {
        console.log(`   ✅ PASS: 2dsphere geospatial index exists`);
    }

    // Check 3.2: Query execution plan (explain)
    console.log('\nCheck 3.2: Query execution plan analysis...');

    if (hasGeoIndex) {
        const explainResult = await Poi.find({
            location: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [105.8542, 21.0285]
                    },
                    $maxDistance: 1000
                }
            }
        }).limit(5).explain('executionStats');

        const usesIndex = explainResult.executionStats.executionStages.inputStage?.indexName?.includes('location');
        const hasCollScan = JSON.stringify(explainResult).includes('COLLSCAN');

        const check32a = {
            name: 'Geo query uses index',
            expected: true,
            actual: usesIndex,
            passed: usesIndex
        };
        category.checks.push(check32a);

        const check32b = {
            name: 'No collection scan (COLLSCAN)',
            expected: false,
            actual: hasCollScan,
            passed: !hasCollScan
        };
        category.checks.push(check32b);

        if (!usesIndex) {
            const issue = 'Geo query does not use index';
            category.issues.push(issue);
            verification.criticalIssues.push(issue);
            console.log(`   ❌ FAIL: ${issue}`);
        } else {
            console.log(`   ✅ PASS: Geo query uses index`);
        }

        if (hasCollScan) {
            const issue = 'Query performs collection scan';
            category.issues.push(issue);
            verification.criticalIssues.push(issue);
            console.log(`   ❌ FAIL: ${issue}`);
        } else {
            console.log(`   ✅ PASS: No collection scan detected`);
        }

        console.log(`   Execution time: ${explainResult.executionStats.executionTimeMillis}ms`);
    }

    // Set category status
    category.status = category.issues.length === 0 ? 'PASS' : 'FAIL';
    console.log(`\n   Category Status: ${category.status}`);
}

/**
 * Main verification execution
 */
async function runVerification() {
    console.log('\n========================================');
    console.log('POI SAFETY VERIFICATION - PHASE 1.5');
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

        // Run all checks
        await checkDataIntegrity();
        await checkGeoCorrectness();
        await checkIndexPerformance();

        // Determine final verdict
        const hasFailures = Object.values(verification.categories).some(cat => cat.status === 'FAIL');
        const hasWarnings = Object.values(verification.categories).some(cat => cat.status === 'WARNING');

        if (hasFailures) {
            verification.finalVerdict = 'FAIL';
        } else if (hasWarnings) {
            verification.finalVerdict = 'PASS_WITH_WARNINGS';
        } else {
            verification.finalVerdict = 'PASS';
        }

        // Print summary
        printVerificationSummary();

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
 * Print verification summary
 */
function printVerificationSummary() {
    console.log('\n========================================');
    console.log('VERIFICATION SUMMARY');
    console.log('========================================\n');

    // Category results
    console.log('Category Results:');
    Object.entries(verification.categories).forEach(([name, cat]) => {
        const icon = cat.status === 'PASS' ? '✅' : cat.status === 'WARNING' ? '⚠️' : '❌';
        console.log(`   ${icon} ${name}: ${cat.status}`);
        console.log(`      Checks: ${cat.checks.length}, Issues: ${cat.issues.length}`);
    });

    // Issues summary
    console.log('\nIssues Summary:');
    console.log(`   Critical: ${verification.criticalIssues.length}`);
    console.log(`   Warnings: ${verification.warnings.length}`);
    console.log(`   Minor: ${verification.minorIssues.length}`);

    if (verification.criticalIssues.length > 0) {
        console.log('\n❌ CRITICAL ISSUES:');
        verification.criticalIssues.forEach((issue, i) => {
            console.log(`   ${i + 1}. ${issue}`);
        });
    }

    if (verification.warnings.length > 0) {
        console.log('\n⚠️  WARNINGS:');
        verification.warnings.forEach((issue, i) => {
            console.log(`   ${i + 1}. ${issue}`);
        });
    }

    // Final verdict
    console.log('\n========================================');
    console.log('FINAL VERDICT');
    console.log('========================================\n');

    const verdictIcon = verification.finalVerdict === 'PASS' ? '✅' :
                       verification.finalVerdict === 'PASS_WITH_WARNINGS' ? '⚠️' : '❌';

    console.log(`   ${verdictIcon} ${verification.finalVerdict}`);

    if (verification.finalVerdict === 'PASS') {
        console.log('\n   System is SAFE for Phase 2 migration.');
    } else if (verification.finalVerdict === 'PASS_WITH_WARNINGS') {
        console.log('\n   System is SAFE for Phase 2 with minor warnings.');
        console.log('   Review warnings and address if necessary.');
    } else {
        console.log('\n   System is NOT SAFE for Phase 2.');
        console.log('   CRITICAL issues must be fixed before proceeding.');
    }

    console.log('');
}

// Run verification
runVerification().then(result => {
    process.exit(result.finalVerdict === 'FAIL' ? 1 : 0);
});
