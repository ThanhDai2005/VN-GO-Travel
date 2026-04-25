/**
 * POI BACKWARD COMPATIBILITY VERIFICATION
 *
 * Tests that existing APIs and system integrations still work
 * after POI migration.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Poi = require('../src/models/poi.model');
const poiService = require('../src/services/poi.service');

/**
 * STEP 4: BACKWARD COMPATIBILITY CHECK
 */
async function checkBackwardCompatibility() {
    console.log('\n========================================');
    console.log('STEP 4: BACKWARD COMPATIBILITY CHECK');
    console.log('========================================\n');

    const results = {
        checks: [],
        issues: [],
        status: 'PENDING'
    };

    try {
        // Check 4.1: POI Service API compatibility
        console.log('Check 4.1: POI Service API compatibility...');

        // Test getNearbyPois
        try {
            const nearbyPois = await poiService.getNearbyPois(21.0285, 105.8542, 1000, 5);
            const check = {
                name: 'getNearbyPois() returns results',
                expected: 'array',
                actual: Array.isArray(nearbyPois) ? 'array' : typeof nearbyPois,
                passed: Array.isArray(nearbyPois) && nearbyPois.length > 0
            };
            results.checks.push(check);

            if (check.passed) {
                console.log(`   ✅ PASS: getNearbyPois() works (${nearbyPois.length} POIs)`);

                // Verify response structure
                const firstPoi = nearbyPois[0];
                const requiredFields = ['id', 'code', 'location', 'radius', 'name', 'content'];
                const missingFields = requiredFields.filter(f => !(f in firstPoi));

                if (missingFields.length > 0) {
                    const issue = `Response missing fields: ${missingFields.join(', ')}`;
                    results.issues.push(issue);
                    console.log(`   ⚠️  WARNING: ${issue}`);
                } else {
                    console.log(`   ✅ PASS: Response structure intact`);
                }
            } else {
                const issue = 'getNearbyPois() failed or returned no results';
                results.issues.push(issue);
                console.log(`   ❌ FAIL: ${issue}`);
            }
        } catch (error) {
            const issue = `getNearbyPois() error: ${error.message}`;
            results.issues.push(issue);
            console.log(`   ❌ FAIL: ${issue}`);
        }

        // Test getPoiByCode
        console.log('\nCheck 4.2: getPoiByCode() compatibility...');
        try {
            const poi = await poiService.getPoiByCode('HO_GUOM');
            const check = {
                name: 'getPoiByCode() returns POI',
                expected: 'object',
                actual: typeof poi,
                passed: poi && typeof poi === 'object'
            };
            results.checks.push(check);

            if (check.passed) {
                console.log(`   ✅ PASS: getPoiByCode() works`);

                // Verify backward compatible fields
                const backwardFields = ['content', 'contentByLang'];
                const missingBackwardFields = backwardFields.filter(f => !(f in poi));

                if (missingBackwardFields.length > 0) {
                    const issue = `Missing backward compatible fields: ${missingBackwardFields.join(', ')}`;
                    results.issues.push(issue);
                    console.log(`   ❌ FAIL: ${issue}`);
                } else {
                    console.log(`   ✅ PASS: Backward compatible fields present`);
                }
            } else {
                const issue = 'getPoiByCode() failed';
                results.issues.push(issue);
                console.log(`   ❌ FAIL: ${issue}`);
            }
        } catch (error) {
            const issue = `getPoiByCode() error: ${error.message}`;
            results.issues.push(issue);
            console.log(`   ❌ FAIL: ${issue}`);
        }

        // Check 4.3: QR scan flow compatibility
        console.log('\nCheck 4.3: QR scan flow compatibility...');
        try {
            // Get a POI to test with
            const testPoi = await Poi.findOne({ status: 'APPROVED' });

            if (testPoi) {
                // Generate QR token
                const qrData = await poiService.generateQrScanTokenForAdmin(testPoi._id.toString());

                const check = {
                    name: 'QR token generation works',
                    expected: 'object with token',
                    actual: qrData && qrData.token ? 'object with token' : 'invalid',
                    passed: qrData && qrData.token && qrData.scanUrl
                };
                results.checks.push(check);

                if (check.passed) {
                    console.log(`   ✅ PASS: QR token generation works`);
                    console.log(`      Token: ${qrData.token.substring(0, 20)}...`);
                    console.log(`      URL: ${qrData.scanUrl.substring(0, 50)}...`);
                } else {
                    const issue = 'QR token generation failed';
                    results.issues.push(issue);
                    console.log(`   ❌ FAIL: ${issue}`);
                }
            } else {
                console.log(`   ⚠️  SKIP: No approved POI found for testing`);
            }
        } catch (error) {
            const issue = `QR scan flow error: ${error.message}`;
            results.issues.push(issue);
            console.log(`   ❌ FAIL: ${issue}`);
        }

        // Check 4.4: Field mapping compatibility
        console.log('\nCheck 4.4: Field mapping compatibility...');

        const samplePoi = await Poi.findOne({});
        if (samplePoi) {
            const mappedPoi = poiService.mapPoiDto(samplePoi, 'en');

            // Check that old API contract is maintained
            const expectedFields = [
                'id', 'code', 'location', 'radius', 'priority',
                'name', 'summary', 'narrationShort', 'narrationLong',
                'content', 'contentByLang', 'localizedContent'
            ];

            const missingFields = expectedFields.filter(f => !(f in mappedPoi));

            const check = {
                name: 'DTO mapping maintains API contract',
                expected: 0,
                actual: missingFields.length,
                passed: missingFields.length === 0
            };
            results.checks.push(check);

            if (missingFields.length > 0) {
                const issue = `DTO missing fields: ${missingFields.join(', ')}`;
                results.issues.push(issue);
                console.log(`   ❌ FAIL: ${issue}`);
            } else {
                console.log(`   ✅ PASS: DTO mapping maintains API contract`);
            }

            // Verify location format
            if (mappedPoi.location && mappedPoi.location.lat && mappedPoi.location.lng) {
                console.log(`   ✅ PASS: Location format is {lat, lng}`);
            } else {
                const issue = 'Location format incorrect (expected {lat, lng})';
                results.issues.push(issue);
                console.log(`   ❌ FAIL: ${issue}`);
            }
        }

    } catch (error) {
        const issue = `Backward compatibility check error: ${error.message}`;
        results.issues.push(issue);
        console.log(`   ❌ FAIL: ${issue}`);
    }

    // Set status
    results.status = results.issues.length === 0 ? 'PASS' : 'FAIL';
    console.log(`\n   Category Status: ${results.status}`);

    return results;
}

/**
 * STEP 5: CONCURRENCY SAFETY CHECK
 */
async function checkConcurrencySafety() {
    console.log('\n========================================');
    console.log('STEP 5: CONCURRENCY SAFETY CHECK');
    console.log('========================================\n');

    const results = {
        checks: [],
        issues: [],
        status: 'PENDING'
    };

    try {
        // Check 5.1: Parallel read queries
        console.log('Check 5.1: Parallel read queries (simulating 20 users)...');

        const startTime = Date.now();
        const parallelQueries = 20;

        const promises = Array(parallelQueries).fill(null).map((_, i) => {
            return poiService.getNearbyPois(
                21.0285 + (Math.random() * 0.01),
                105.8542 + (Math.random() * 0.01),
                1000,
                5
            );
        });

        const results5_1 = await Promise.all(promises);
        const endTime = Date.now();
        const totalTime = endTime - startTime;
        const avgTime = totalTime / parallelQueries;

        const check = {
            name: 'Parallel queries complete without errors',
            expected: parallelQueries,
            actual: results5_1.length,
            passed: results5_1.length === parallelQueries
        };
        results.checks.push(check);

        console.log(`   Total time: ${totalTime}ms`);
        console.log(`   Average time per query: ${avgTime.toFixed(2)}ms`);

        if (check.passed) {
            console.log(`   ✅ PASS: All ${parallelQueries} parallel queries succeeded`);

            // Check performance degradation
            if (avgTime > 200) {
                const issue = `Average query time too high: ${avgTime.toFixed(2)}ms (expected <200ms)`;
                results.issues.push(issue);
                console.log(`   ⚠️  WARNING: ${issue}`);
            } else {
                console.log(`   ✅ PASS: Performance acceptable (<200ms avg)`);
            }
        } else {
            const issue = 'Some parallel queries failed';
            results.issues.push(issue);
            console.log(`   ❌ FAIL: ${issue}`);
        }

        // Check 5.2: Concurrent writes (if applicable)
        console.log('\nCheck 5.2: Unique constraint enforcement under concurrency...');

        // This tests that the unique index on code prevents duplicates
        // even under concurrent inserts
        const testCode = `TEST_CONCURRENT_${Date.now()}`;

        try {
            const concurrentInserts = Array(5).fill(null).map(() => {
                return Poi.create({
                    code: testCode,
                    location: {
                        type: 'Point',
                        coordinates: [105.8542, 21.0285]
                    },
                    radius: 50,
                    name: 'Test POI',
                    languageCode: 'vi',
                    status: 'APPROVED'
                }).catch(err => err);
            });

            const insertResults = await Promise.all(concurrentInserts);

            // Count successful inserts
            const successCount = insertResults.filter(r => r && r._id).length;
            const errorCount = insertResults.filter(r => r instanceof Error).length;

            const check5_2 = {
                name: 'Unique constraint prevents duplicate inserts',
                expected: 1,
                actual: successCount,
                passed: successCount === 1 && errorCount === 4
            };
            results.checks.push(check5_2);

            if (check5_2.passed) {
                console.log(`   ✅ PASS: Only 1 insert succeeded, ${errorCount} blocked by unique constraint`);
            } else {
                const issue = `Unique constraint failed: ${successCount} inserts succeeded (expected 1)`;
                results.issues.push(issue);
                console.log(`   ❌ FAIL: ${issue}`);
            }

            // Cleanup
            await Poi.deleteMany({ code: testCode });

        } catch (error) {
            const issue = `Concurrency test error: ${error.message}`;
            results.issues.push(issue);
            console.log(`   ❌ FAIL: ${issue}`);
        }

    } catch (error) {
        const issue = `Concurrency safety check error: ${error.message}`;
        results.issues.push(issue);
        console.log(`   ❌ FAIL: ${issue}`);
    }

    // Set status
    results.status = results.issues.length === 0 ? 'PASS' : 'FAIL';
    console.log(`\n   Category Status: ${results.status}`);

    return results;
}

/**
 * STEP 6: SYSTEM FLOW VALIDATION
 */
async function checkSystemFlow() {
    console.log('\n========================================');
    console.log('STEP 6: SYSTEM FLOW VALIDATION');
    console.log('========================================\n');

    const results = {
        checks: [],
        issues: [],
        status: 'PENDING'
    };

    try {
        console.log('Validating: QR Scan → POI → Content → Audio Queue → Heatmap\n');

        // Step 1: QR Scan → POI lookup
        console.log('Step 1: QR Scan → POI lookup...');
        const testPoi = await Poi.findOne({ status: 'APPROVED' });

        if (!testPoi) {
            const issue = 'No approved POI found for flow testing';
            results.issues.push(issue);
            console.log(`   ❌ FAIL: ${issue}`);
            results.status = 'FAIL';
            return results;
        }

        console.log(`   Using test POI: ${testPoi.code}`);

        // Step 2: POI → Content mapping
        console.log('\nStep 2: POI → Content mapping...');
        const mappedPoi = poiService.mapPoiDto(testPoi, 'vi');

        const hasContent = mappedPoi.content && mappedPoi.content.length > 0;
        const hasLocalizedContent = mappedPoi.localizedContent && mappedPoi.localizedContent.vi;

        const check2 = {
            name: 'POI has content for audio playback',
            expected: true,
            actual: hasContent && hasLocalizedContent,
            passed: hasContent && hasLocalizedContent
        };
        results.checks.push(check2);

        if (check2.passed) {
            console.log(`   ✅ PASS: POI has content`);
            console.log(`      Content length: ${mappedPoi.content.length} chars`);
        } else {
            const issue = 'POI missing content for audio playback';
            results.issues.push(issue);
            console.log(`   ⚠️  WARNING: ${issue}`);
        }

        // Step 3: Geofence detection
        console.log('\nStep 3: Geofence detection...');
        const [lng, lat] = testPoi.location.coordinates;

        // Test point inside geofence
        const nearbyCheck = await Poi.findOne({
            _id: testPoi._id,
            location: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [lng + 0.0001, lat + 0.0001] // ~10m away
                    },
                    $maxDistance: testPoi.radius
                }
            }
        });

        const check3 = {
            name: 'Geofence detection works',
            expected: true,
            actual: nearbyCheck !== null,
            passed: nearbyCheck !== null
        };
        results.checks.push(check3);

        if (check3.passed) {
            console.log(`   ✅ PASS: Geofence detection works`);
        } else {
            const issue = 'Geofence detection failed';
            results.issues.push(issue);
            console.log(`   ❌ FAIL: ${issue}`);
        }

        // Step 4: Heatmap data structure
        console.log('\nStep 4: Heatmap data structure...');

        // Verify POI has coordinates for heatmap
        const hasValidCoords = testPoi.location &&
                              testPoi.location.type === 'Point' &&
                              Array.isArray(testPoi.location.coordinates) &&
                              testPoi.location.coordinates.length === 2;

        const check4 = {
            name: 'POI has valid coordinates for heatmap',
            expected: true,
            actual: hasValidCoords,
            passed: hasValidCoords
        };
        results.checks.push(check4);

        if (check4.passed) {
            console.log(`   ✅ PASS: POI coordinates valid for heatmap`);
            console.log(`      Coordinates: [${lng}, ${lat}]`);
        } else {
            const issue = 'POI coordinates invalid for heatmap';
            results.issues.push(issue);
            console.log(`   ❌ FAIL: ${issue}`);
        }

        // Step 5: Overall flow integrity
        console.log('\nStep 5: Overall flow integrity...');

        const flowIntact = check2.passed && check3.passed && check4.passed;

        const check5 = {
            name: 'Complete flow QR→POI→Content→Heatmap intact',
            expected: true,
            actual: flowIntact,
            passed: flowIntact
        };
        results.checks.push(check5);

        if (check5.passed) {
            console.log(`   ✅ PASS: Complete system flow intact`);
        } else {
            const issue = 'System flow has broken components';
            results.issues.push(issue);
            console.log(`   ❌ FAIL: ${issue}`);
        }

    } catch (error) {
        const issue = `System flow validation error: ${error.message}`;
        results.issues.push(issue);
        console.log(`   ❌ FAIL: ${issue}`);
    }

    // Set status
    results.status = results.issues.length === 0 ? 'PASS' : 'FAIL';
    console.log(`\n   Category Status: ${results.status}`);

    return results;
}

/**
 * STEP 7: PERFORMANCE CHECK
 */
async function checkPerformance() {
    console.log('\n========================================');
    console.log('STEP 7: PERFORMANCE CHECK');
    console.log('========================================\n');

    const results = {
        checks: [],
        issues: [],
        metrics: {},
        status: 'PENDING'
    };

    try {
        // Benchmark 1: Single nearby query
        console.log('Benchmark 1: Single nearby query...');

        const iterations = 10;
        const times = [];

        for (let i = 0; i < iterations; i++) {
            const start = Date.now();
            await poiService.getNearbyPois(21.0285, 105.8542, 1000, 5);
            const end = Date.now();
            times.push(end - start);
        }

        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const p95Time = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];

        results.metrics.singleQueryAvg = avgTime;
        results.metrics.singleQueryP95 = p95Time;

        console.log(`   Average: ${avgTime.toFixed(2)}ms`);
        console.log(`   P95: ${p95Time}ms`);

        const check1 = {
            name: 'Single query P95 < 100ms',
            expected: '<100ms',
            actual: `${p95Time}ms`,
            passed: p95Time < 100
        };
        results.checks.push(check1);

        if (check1.passed) {
            console.log(`   ✅ PASS: Performance acceptable`);
        } else {
            const issue = `Single query P95 too high: ${p95Time}ms`;
            results.issues.push(issue);
            console.log(`   ⚠️  WARNING: ${issue}`);
        }

        // Benchmark 2: Concurrent queries
        console.log('\nBenchmark 2: Concurrent queries (50 users)...');

        const concurrentUsers = 50;
        const startConcurrent = Date.now();

        const concurrentPromises = Array(concurrentUsers).fill(null).map(() =>
            poiService.getNearbyPois(
                21.0285 + (Math.random() * 0.01),
                105.8542 + (Math.random() * 0.01),
                1000,
                5
            )
        );

        await Promise.all(concurrentPromises);
        const endConcurrent = Date.now();
        const concurrentTime = endConcurrent - startConcurrent;
        const avgConcurrent = concurrentTime / concurrentUsers;

        results.metrics.concurrentTotal = concurrentTime;
        results.metrics.concurrentAvg = avgConcurrent;

        console.log(`   Total time: ${concurrentTime}ms`);
        console.log(`   Average per query: ${avgConcurrent.toFixed(2)}ms`);

        const check2 = {
            name: 'Concurrent query avg < 200ms',
            expected: '<200ms',
            actual: `${avgConcurrent.toFixed(2)}ms`,
            passed: avgConcurrent < 200
        };
        results.checks.push(check2);

        if (check2.passed) {
            console.log(`   ✅ PASS: Concurrent performance acceptable`);
        } else {
            const issue = `Concurrent query avg too high: ${avgConcurrent.toFixed(2)}ms`;
            results.issues.push(issue);
            console.log(`   ⚠️  WARNING: ${issue}`);
        }

        // Check for performance degradation
        const degradation = ((avgConcurrent - avgTime) / avgTime) * 100;
        results.metrics.degradation = degradation;

        console.log(`\n   Performance degradation: ${degradation.toFixed(1)}%`);

        const check3 = {
            name: 'Performance degradation < 100%',
            expected: '<100%',
            actual: `${degradation.toFixed(1)}%`,
            passed: degradation < 100
        };
        results.checks.push(check3);

        if (check3.passed) {
            console.log(`   ✅ PASS: Acceptable degradation under load`);
        } else {
            const issue = `High performance degradation: ${degradation.toFixed(1)}%`;
            results.issues.push(issue);
            console.log(`   ⚠️  WARNING: ${issue}`);
        }

    } catch (error) {
        const issue = `Performance check error: ${error.message}`;
        results.issues.push(issue);
        console.log(`   ❌ FAIL: ${issue}`);
    }

    // Set status
    results.status = results.issues.length === 0 ? 'PASS' : 'WARNING';
    console.log(`\n   Category Status: ${results.status}`);

    return results;
}

module.exports = {
    checkBackwardCompatibility,
    checkConcurrencySafety,
    checkSystemFlow,
    checkPerformance
};
