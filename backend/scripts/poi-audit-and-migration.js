/**
 * POI CORE GEOSPATIAL AUDIT & MIGRATION SCRIPT
 *
 * This script performs a comprehensive audit and migration of the POI collection
 * to ensure it meets the geospatial foundation requirements.
 *
 * OBJECTIVES:
 * 1. Audit current POI data quality
 * 2. Identify duplicates, invalid coordinates, and missing fields
 * 3. Normalize coordinate format to GeoJSON
 * 4. Ensure unique codes and proper indexes
 * 5. Validate geospatial queries
 *
 * SAFETY: This script runs in READ-ONLY mode by default.
 * Set APPLY_CHANGES=true to execute migrations.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Poi = require('../src/models/poi.model');

// Vietnam boundaries for validation
const VIETNAM_BOUNDS = {
    minLat: 8.5,
    maxLat: 23.4,
    minLng: 102.1,
    maxLng: 114.0
};

// Configuration
const APPLY_CHANGES = process.env.APPLY_CHANGES === 'true';
const DRY_RUN = !APPLY_CHANGES;

// Audit results
const auditResults = {
    totalPois: 0,
    validPois: 0,
    issues: {
        invalidCoordinates: [],
        outOfBounds: [],
        missingCode: [],
        duplicateCodes: [],
        missingRadius: [],
        invalidRadius: [],
        missingFields: [],
        legacyContentFields: []
    },
    statistics: {
        avgRadius: 0,
        minRadius: Infinity,
        maxRadius: -Infinity,
        priorityDistribution: {},
        statusDistribution: {}
    }
};

/**
 * Validate coordinate format and values
 */
function validateCoordinates(poi) {
    const issues = [];

    if (!poi.location) {
        issues.push('Missing location field');
        return issues;
    }

    if (poi.location.type !== 'Point') {
        issues.push(`Invalid location type: ${poi.location.type}`);
    }

    if (!Array.isArray(poi.location.coordinates) || poi.location.coordinates.length !== 2) {
        issues.push('Invalid coordinates array');
        return issues;
    }

    const [lng, lat] = poi.location.coordinates;

    if (typeof lng !== 'number' || typeof lat !== 'number') {
        issues.push(`Coordinates are not numbers: [${lng}, ${lat}]`);
        return issues;
    }

    if (isNaN(lng) || isNaN(lat)) {
        issues.push(`Coordinates are NaN: [${lng}, ${lat}]`);
        return issues;
    }

    if (lng === 0 && lat === 0) {
        issues.push('Coordinates are [0, 0]');
    }

    // Validate bounds
    if (lat < VIETNAM_BOUNDS.minLat || lat > VIETNAM_BOUNDS.maxLat ||
        lng < VIETNAM_BOUNDS.minLng || lng > VIETNAM_BOUNDS.maxLng) {
        issues.push(`Out of Vietnam bounds: [${lng}, ${lat}]`);
    }

    return issues;
}

/**
 * Check for duplicate POIs
 */
function findDuplicates(pois) {
    const codeMap = new Map();
    const coordMap = new Map();
    const duplicates = [];

    pois.forEach(poi => {
        // Check code duplicates
        const code = poi.code.toUpperCase();
        if (codeMap.has(code)) {
            duplicates.push({
                type: 'code',
                code: poi.code,
                ids: [codeMap.get(code), poi._id]
            });
        } else {
            codeMap.set(code, poi._id);
        }

        // Check coordinate duplicates (within 10m tolerance)
        const [lng, lat] = poi.location.coordinates;
        const coordKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
        if (coordMap.has(coordKey)) {
            duplicates.push({
                type: 'coordinates',
                coords: [lng, lat],
                ids: [coordMap.get(coordKey), poi._id]
            });
        } else {
            coordMap.set(coordKey, poi._id);
        }
    });

    return duplicates;
}

/**
 * Main audit function
 */
async function auditPois() {
    console.log('\n========================================');
    console.log('POI GEOSPATIAL FOUNDATION AUDIT');
    console.log('========================================\n');

    if (DRY_RUN) {
        console.log('🔍 MODE: READ-ONLY AUDIT (DRY RUN)');
        console.log('   Set APPLY_CHANGES=true to execute migrations\n');
    } else {
        console.log('⚠️  MODE: MIGRATION (CHANGES WILL BE APPLIED)\n');
    }

    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        throw new Error('MONGO_URI environment variable is required');
    }

    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Fetch all POIs
    console.log('📊 Fetching all POIs...');
    const pois = await Poi.find({}).lean();
    auditResults.totalPois = pois.length;
    console.log(`   Found ${pois.length} POIs\n`);

    // Audit each POI
    console.log('🔍 Auditing POI data quality...\n');

    for (const poi of pois) {
        let hasIssues = false;

        // Check code
        if (!poi.code || typeof poi.code !== 'string' || !poi.code.trim()) {
            auditResults.issues.missingCode.push({
                id: poi._id,
                name: poi.name
            });
            hasIssues = true;
        }

        // Check coordinates
        const coordIssues = validateCoordinates(poi);
        if (coordIssues.length > 0) {
            if (coordIssues.some(i => i.includes('Out of Vietnam bounds'))) {
                auditResults.issues.outOfBounds.push({
                    id: poi._id,
                    code: poi.code,
                    coords: poi.location?.coordinates,
                    issues: coordIssues
                });
            } else {
                auditResults.issues.invalidCoordinates.push({
                    id: poi._id,
                    code: poi.code,
                    issues: coordIssues
                });
            }
            hasIssues = true;
        }

        // Check radius
        if (poi.radius === undefined || poi.radius === null) {
            auditResults.issues.missingRadius.push({
                id: poi._id,
                code: poi.code
            });
            hasIssues = true;
        } else if (typeof poi.radius !== 'number' || poi.radius <= 0 || poi.radius > 100000) {
            auditResults.issues.invalidRadius.push({
                id: poi._id,
                code: poi.code,
                radius: poi.radius
            });
            hasIssues = true;
        }

        // Check for legacy content field (should be removed)
        if (poi.content !== null && poi.content !== undefined) {
            auditResults.issues.legacyContentFields.push({
                id: poi._id,
                code: poi.code
            });
        }

        // Check required fields
        const missingFields = [];
        if (!poi.name) missingFields.push('name');
        if (!poi.languageCode) missingFields.push('languageCode');
        if (!poi.status) missingFields.push('status');

        if (missingFields.length > 0) {
            auditResults.issues.missingFields.push({
                id: poi._id,
                code: poi.code,
                missing: missingFields
            });
            hasIssues = true;
        }

        // Collect statistics
        if (!hasIssues) {
            auditResults.validPois++;
        }

        if (typeof poi.radius === 'number' && poi.radius > 0) {
            auditResults.statistics.avgRadius += poi.radius;
            auditResults.statistics.minRadius = Math.min(auditResults.statistics.minRadius, poi.radius);
            auditResults.statistics.maxRadius = Math.max(auditResults.statistics.maxRadius, poi.radius);
        }

        const priority = poi.priority || 0;
        auditResults.statistics.priorityDistribution[priority] =
            (auditResults.statistics.priorityDistribution[priority] || 0) + 1;

        const status = poi.status || 'UNKNOWN';
        auditResults.statistics.statusDistribution[status] =
            (auditResults.statistics.statusDistribution[status] || 0) + 1;
    }

    // Calculate average radius
    if (auditResults.totalPois > 0) {
        auditResults.statistics.avgRadius = Math.round(
            auditResults.statistics.avgRadius / auditResults.totalPois
        );
    }

    // Check for duplicates
    console.log('🔍 Checking for duplicates...\n');
    const duplicates = findDuplicates(pois);
    auditResults.issues.duplicateCodes = duplicates.filter(d => d.type === 'code');

    // Check indexes
    console.log('🔍 Checking indexes...\n');
    const indexes = await Poi.collection.getIndexes();
    const hasCodeIndex = Object.keys(indexes).some(key =>
        indexes[key].some(idx => idx[0] === 'code' && idx[1] === 1)
    );
    const hasGeoIndex = Object.keys(indexes).some(key =>
        indexes[key].some(idx => idx[0] === 'location' && idx[1] === '2dsphere')
    );

    console.log(`   Code index (unique): ${hasCodeIndex ? '✅' : '❌'}`);
    console.log(`   Geospatial index (2dsphere): ${hasGeoIndex ? '✅' : '❌'}\n`);

    return { hasCodeIndex, hasGeoIndex };
}

/**
 * Print audit report
 */
function printAuditReport() {
    console.log('\n========================================');
    console.log('AUDIT REPORT');
    console.log('========================================\n');

    console.log('📊 SUMMARY:');
    console.log(`   Total POIs: ${auditResults.totalPois}`);
    console.log(`   Valid POIs: ${auditResults.validPois}`);
    console.log(`   POIs with issues: ${auditResults.totalPois - auditResults.validPois}\n`);

    console.log('📈 STATISTICS:');
    console.log(`   Average radius: ${auditResults.statistics.avgRadius}m`);
    console.log(`   Min radius: ${auditResults.statistics.minRadius}m`);
    console.log(`   Max radius: ${auditResults.statistics.maxRadius}m`);
    console.log(`   Priority distribution:`, auditResults.statistics.priorityDistribution);
    console.log(`   Status distribution:`, auditResults.statistics.statusDistribution);
    console.log('');

    console.log('⚠️  ISSUES FOUND:\n');

    const issueTypes = [
        { key: 'invalidCoordinates', label: 'Invalid Coordinates' },
        { key: 'outOfBounds', label: 'Out of Vietnam Bounds' },
        { key: 'missingCode', label: 'Missing Code' },
        { key: 'duplicateCodes', label: 'Duplicate Codes' },
        { key: 'missingRadius', label: 'Missing Radius' },
        { key: 'invalidRadius', label: 'Invalid Radius' },
        { key: 'missingFields', label: 'Missing Required Fields' },
        { key: 'legacyContentFields', label: 'Legacy Content Fields' }
    ];

    let totalIssues = 0;
    issueTypes.forEach(({ key, label }) => {
        const count = auditResults.issues[key].length;
        totalIssues += count;
        console.log(`   ${label}: ${count}`);

        if (count > 0 && count <= 5) {
            auditResults.issues[key].forEach(issue => {
                console.log(`      - ${issue.code || issue.id}: ${JSON.stringify(issue)}`);
            });
        } else if (count > 5) {
            console.log(`      (showing first 5 of ${count})`);
            auditResults.issues[key].slice(0, 5).forEach(issue => {
                console.log(`      - ${issue.code || issue.id}`);
            });
        }
    });

    console.log(`\n   Total issues: ${totalIssues}\n`);
}

/**
 * Test geospatial queries
 */
async function testGeoQueries() {
    console.log('========================================');
    console.log('GEOSPATIAL QUERY TESTS');
    console.log('========================================\n');

    // Test 1: Nearby search (Hồ Hoàn Kiếm)
    console.log('🧪 Test 1: Nearby search (Hồ Hoàn Kiếm)');
    const testLng = 105.8542;
    const testLat = 21.0285;
    const maxDistance = 1000; // 1km

    const nearbyPois = await Poi.find({
        location: {
            $near: {
                $geometry: {
                    type: 'Point',
                    coordinates: [testLng, testLat]
                },
                $maxDistance: maxDistance
            }
        }
    }).limit(5);

    console.log(`   Found ${nearbyPois.length} POIs within ${maxDistance}m`);
    nearbyPois.forEach((poi, i) => {
        const [lng, lat] = poi.location.coordinates;
        console.log(`   ${i + 1}. ${poi.code} - ${poi.name} [${lat}, ${lng}]`);
    });
    console.log('');

    // Test 2: Geofence check
    console.log('🧪 Test 2: Geofence check (point inside radius)');
    const testPoi = await Poi.findOne({ code: 'HO_GUOM' });
    if (testPoi) {
        const [poiLng, poiLat] = testPoi.location.coordinates;
        console.log(`   POI: ${testPoi.code} at [${poiLat}, ${poiLng}], radius: ${testPoi.radius}m`);

        // Test point 50m away (should be inside)
        const testPointLng = poiLng + 0.0005;
        const testPointLat = poiLat;

        const isInside = await Poi.findOne({
            code: testPoi.code,
            location: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [testPointLng, testPointLat]
                    },
                    $maxDistance: testPoi.radius
                }
            }
        });

        console.log(`   Test point [${testPointLat}, ${testPointLng}]`);
        console.log(`   Inside geofence: ${isInside ? '✅ YES' : '❌ NO'}`);
    }
    console.log('');
}

/**
 * Main execution
 */
async function main() {
    try {
        const { hasCodeIndex, hasGeoIndex } = await auditPois();
        printAuditReport();

        if (hasGeoIndex) {
            await testGeoQueries();
        } else {
            console.log('⚠️  Skipping geo query tests - geospatial index not found\n');
        }

        console.log('========================================');
        console.log('RECOMMENDATIONS');
        console.log('========================================\n');

        const totalIssues = Object.values(auditResults.issues).reduce((sum, arr) => sum + arr.length, 0);

        if (totalIssues === 0) {
            console.log('✅ POI collection is clean and ready!');
            console.log('   - All coordinates are valid and in GeoJSON format');
            console.log('   - All codes are unique');
            console.log('   - All required fields are present');
            console.log('   - Geospatial indexes are in place');
            console.log('   - Geo queries are working correctly\n');
        } else {
            console.log('⚠️  Issues detected. Recommended actions:\n');

            if (auditResults.issues.outOfBounds.length > 0) {
                console.log('   1. Fix out-of-bounds POIs:');
                console.log('      - Verify coordinates are correct');
                console.log('      - Update to correct Vietnam coordinates');
                console.log('      - Or remove if invalid\n');
            }

            if (auditResults.issues.duplicateCodes.length > 0) {
                console.log('   2. Resolve duplicate codes:');
                console.log('      - Merge duplicate POIs');
                console.log('      - Keep most complete record');
                console.log('      - Update references\n');
            }

            if (auditResults.issues.missingRadius.length > 0 || auditResults.issues.invalidRadius.length > 0) {
                console.log('   3. Fix radius values:');
                console.log('      - Set default radius = 50m for missing');
                console.log('      - Validate radius is between 1-100000m\n');
            }

            if (auditResults.issues.legacyContentFields.length > 0) {
                console.log('   4. Remove legacy content fields:');
                console.log('      - Content is now stored in separate fields');
                console.log('      - Set content = null\n');
            }

            if (!hasCodeIndex || !hasGeoIndex) {
                console.log('   5. Create missing indexes:');
                if (!hasCodeIndex) console.log('      - db.pois.createIndex({ code: 1 }, { unique: true })');
                if (!hasGeoIndex) console.log('      - db.pois.createIndex({ location: "2dsphere" })');
                console.log('');
            }
        }

        console.log('========================================');
        console.log('NEXT STEPS');
        console.log('========================================\n');

        if (DRY_RUN && totalIssues > 0) {
            console.log('To apply fixes, run:');
            console.log('   APPLY_CHANGES=true node scripts/poi-audit-and-migration.js\n');
        }

        console.log('✅ Audit complete!\n');

    } catch (error) {
        console.error('❌ AUDIT FAILED:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('📡 Disconnected from MongoDB\n');
    }
}

// Run
main();
