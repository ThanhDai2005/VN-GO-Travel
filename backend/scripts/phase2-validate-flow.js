/**
 * PHASE 2: VALIDATION SCRIPT
 *
 * Validates Phase 2 migration by checking:
 * - All POIs have corresponding content entries
 * - Dual-write is working correctly
 * - Language packs are up to date
 * - API responses maintain backward compatibility
 *
 * Run: node scripts/phase2-validate-flow.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Poi = require('../src/models/poi.model');
const PoiContent = require('../src/models/poi-content.model');
const LanguagePack = require('../src/models/language-pack.model');
const poiService = require('../src/services/poi.service');

const results = {
    timestamp: new Date().toISOString(),
    checks: {
        contentSync: { status: 'PENDING', issues: [] },
        dualWrite: { status: 'PENDING', issues: [] },
        languagePacks: { status: 'PENDING', issues: [] },
        apiCompatibility: { status: 'PENDING', issues: [] },
        performance: { status: 'PENDING', metrics: {} }
    },
    finalVerdict: 'PENDING',
    errors: []
};

/**
 * Check 1: Content Synchronization
 */
async function checkContentSync() {
    console.log('\n========================================');
    console.log('CHECK 1: CONTENT SYNCHRONIZATION');
    console.log('========================================\n');

    const check = results.checks.contentSync;

    // Get all POIs
    const pois = await Poi.find({}).lean();
    console.log(`Total POIs: ${pois.length}`);

    // Check each POI has content
    let missingContent = 0;
    let syncedContent = 0;

    for (const poi of pois) {
        const content = await PoiContent.findOne({
            poiCode: poi.code,
            language: poi.languageCode || 'vi'
        }).lean();

        if (!content) {
            missingContent++;
            check.issues.push(`POI ${poi.code} missing content entry`);
            console.log(`   ❌ ${poi.code}: No content entry`);
        } else {
            // Verify content matches POI
            const matches =
                content.title === poi.name &&
                content.description === (poi.summary || '') &&
                content.narrationShort === (poi.narrationShort || '') &&
                content.narrationLong === (poi.narrationLong || '');

            if (!matches) {
                check.issues.push(`POI ${poi.code} content mismatch`);
                console.log(`   ⚠️  ${poi.code}: Content mismatch`);
            } else {
                syncedContent++;
                console.log(`   ✅ ${poi.code}: Content synced`);
            }
        }
    }

    console.log(`\n   Synced: ${syncedContent}/${pois.length}`);
    console.log(`   Missing: ${missingContent}`);

    check.status = missingContent === 0 ? 'PASS' : 'FAIL';
}

/**
 * Check 2: Dual-Write Test
 */
async function checkDualWrite() {
    console.log('\n========================================');
    console.log('CHECK 2: DUAL-WRITE TEST');
    console.log('========================================\n');

    const check = results.checks.dualWrite;

    try {
        // Create test POI
        const testCode = `TEST_DUAL_WRITE_${Date.now()}`;
        console.log(`Creating test POI: ${testCode}`);

        const testPoi = {
            code: testCode,
            location: { lat: 21.0285, lng: 105.8542 },
            radius: 100,
            name: 'Test Dual Write',
            summary: 'Test summary',
            narrationShort: 'Short narration',
            narrationLong: 'Long narration',
            languageCode: 'vi'
        };

        await poiService.createPoi(testPoi);

        // Verify POI created
        const poi = await Poi.findOne({ code: testCode }).lean();
        if (!poi) {
            check.issues.push('Test POI not created in pois collection');
            console.log('   ❌ POI not created');
        } else {
            console.log('   ✅ POI created in pois collection');
        }

        // Verify content created
        const content = await PoiContent.findOne({ poiCode: testCode, language: 'vi' }).lean();
        if (!content) {
            check.issues.push('Test POI content not created in poi_contents collection');
            console.log('   ❌ Content not created');
        } else {
            console.log('   ✅ Content created in poi_contents collection');

            // Verify content matches
            if (content.title === testPoi.name &&
                content.description === testPoi.summary &&
                content.narrationShort === testPoi.narrationShort &&
                content.narrationLong === testPoi.narrationLong) {
                console.log('   ✅ Content matches POI data');
            } else {
                check.issues.push('Test POI content mismatch');
                console.log('   ❌ Content mismatch');
            }
        }

        // Cleanup
        await Poi.deleteOne({ code: testCode });
        await PoiContent.deleteOne({ poiCode: testCode });
        console.log('   ✅ Test POI cleaned up');

        check.status = check.issues.length === 0 ? 'PASS' : 'FAIL';

    } catch (error) {
        check.issues.push(`Dual-write test failed: ${error.message}`);
        check.status = 'FAIL';
        console.error('   ❌ Error:', error.message);
    }
}

/**
 * Check 3: Language Packs
 */
async function checkLanguagePacks() {
    console.log('\n========================================');
    console.log('CHECK 3: LANGUAGE PACKS');
    console.log('========================================\n');

    const check = results.checks.languagePacks;

    // Get all languages in poi_contents
    const languages = await PoiContent.distinct('language');
    console.log(`Languages in poi_contents: ${languages.join(', ')}`);

    for (const lang of languages) {
        const pack = await LanguagePack.findOne({ language: lang }).lean();

        if (!pack) {
            check.issues.push(`Language pack missing for ${lang}`);
            console.log(`   ❌ ${lang}: Pack not found`);
            continue;
        }

        // Check if pack is up to date
        const contentCount = await PoiContent.countDocuments({ language: lang });

        if (pack.poiCount !== contentCount) {
            check.issues.push(`Language pack ${lang} out of date (pack: ${pack.poiCount}, actual: ${contentCount})`);
            console.log(`   ⚠️  ${lang}: Pack out of date (${pack.poiCount} vs ${contentCount})`);
        } else {
            console.log(`   ✅ ${lang}: Pack up to date (${pack.poiCount} POIs)`);
        }

        // Check pack size
        console.log(`      Size: ${(pack.totalSize / 1024).toFixed(2)} KB`);
        console.log(`      Version: ${pack.version}`);
    }

    check.status = check.issues.length === 0 ? 'PASS' : 'WARNING';
}

/**
 * Check 4: API Backward Compatibility
 */
async function checkApiCompatibility() {
    console.log('\n========================================');
    console.log('CHECK 4: API BACKWARD COMPATIBILITY');
    console.log('========================================\n');

    const check = results.checks.apiCompatibility;

    try {
        // Get first POI
        const poi = await Poi.findOne({}).lean();
        if (!poi) {
            check.issues.push('No POIs found for testing');
            check.status = 'SKIP';
            return;
        }

        console.log(`Testing with POI: ${poi.code}`);

        // Get POI via service (simulates API call)
        const dto = await poiService.getPoiByCode(poi.code);

        // Verify required fields exist
        const requiredFields = [
            'id', 'code', 'location', 'radius', 'priority',
            'name', 'summary', 'narrationShort', 'narrationLong',
            'content', 'contentByLang', 'localizedContent'
        ];

        for (const field of requiredFields) {
            if (dto[field] === undefined) {
                check.issues.push(`Missing field in DTO: ${field}`);
                console.log(`   ❌ Missing field: ${field}`);
            }
        }

        if (check.issues.length === 0) {
            console.log('   ✅ All required fields present');
        }

        // Verify structure
        if (dto.location && dto.location.lat && dto.location.lng) {
            console.log('   ✅ Location structure correct');
        } else {
            check.issues.push('Location structure incorrect');
            console.log('   ❌ Location structure incorrect');
        }

        if (dto.contentByLang && dto.contentByLang.vi !== undefined) {
            console.log('   ✅ contentByLang structure correct');
        } else {
            check.issues.push('contentByLang structure incorrect');
            console.log('   ❌ contentByLang structure incorrect');
        }

        if (dto.localizedContent && dto.localizedContent.vi) {
            console.log('   ✅ localizedContent structure correct');
        } else {
            check.issues.push('localizedContent structure incorrect');
            console.log('   ❌ localizedContent structure incorrect');
        }

        check.status = check.issues.length === 0 ? 'PASS' : 'FAIL';

    } catch (error) {
        check.issues.push(`API compatibility test failed: ${error.message}`);
        check.status = 'FAIL';
        console.error('   ❌ Error:', error.message);
    }
}

/**
 * Check 5: Performance
 */
async function checkPerformance() {
    console.log('\n========================================');
    console.log('CHECK 5: PERFORMANCE');
    console.log('========================================\n');

    const check = results.checks.performance;

    try {
        const poi = await Poi.findOne({}).lean();
        if (!poi) {
            check.status = 'SKIP';
            return;
        }

        // Test content lookup performance
        const iterations = 10;
        const times = [];

        for (let i = 0; i < iterations; i++) {
            const start = Date.now();
            await PoiContent.findOne({ poiCode: poi.code, language: 'vi' });
            times.push(Date.now() - start);
        }

        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        const max = Math.max(...times);

        check.metrics.contentLookupAvg = avg;
        check.metrics.contentLookupMax = max;

        console.log(`   Content lookup average: ${avg.toFixed(2)}ms`);
        console.log(`   Content lookup max: ${max}ms`);

        if (avg < 50) {
            console.log('   ✅ Performance excellent (<50ms)');
            check.status = 'PASS';
        } else if (avg < 100) {
            console.log('   ✅ Performance acceptable (<100ms)');
            check.status = 'PASS';
        } else {
            console.log('   ⚠️  Performance warning (>100ms)');
            check.issues.push(`Content lookup slow: ${avg.toFixed(2)}ms`);
            check.status = 'WARNING';
        }

    } catch (error) {
        check.issues.push(`Performance test failed: ${error.message}`);
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

    if (hasFail) {
        results.finalVerdict = 'FAIL';
    } else if (hasWarning) {
        results.finalVerdict = 'PASS_WITH_WARNINGS';
    } else {
        results.finalVerdict = 'PASS';
    }
}

/**
 * Print final report
 */
function printFinalReport() {
    console.log('\n========================================');
    console.log('PHASE 2: VALIDATION REPORT');
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
                 results.finalVerdict === 'PASS_WITH_WARNINGS' ? '⚠️' : '❌';

    console.log(`   ${icon} ${results.finalVerdict}\n`);

    if (results.finalVerdict === 'PASS') {
        console.log('   ✅ Phase 2 migration validated successfully');
        console.log('   ✅ Dual-write working correctly');
        console.log('   ✅ API backward compatibility maintained');
        console.log('   ✅ Ready for Phase 2D (API transition)\n');
    } else if (results.finalVerdict === 'PASS_WITH_WARNINGS') {
        console.log('   ⚠️  Phase 2 migration validated with warnings');
        console.log('   ⚠️  Review warnings above');
        console.log('   ⚠️  Consider regenerating language packs\n');
    } else {
        console.log('   ❌ Phase 2 migration validation FAILED');
        console.log('   ❌ Fix issues before proceeding');
        console.log('   ❌ DO NOT proceed to Phase 2D\n');
    }
}

/**
 * Main execution
 */
async function runValidation() {
    console.log('\n========================================');
    console.log('PHASE 2: VALIDATION');
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
        await checkContentSync();
        await checkDualWrite();
        await checkLanguagePacks();
        await checkApiCompatibility();
        await checkPerformance();

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
