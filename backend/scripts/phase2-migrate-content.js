/**
 * PHASE 2C: MIGRATE CONTENT TO POI_CONTENTS
 *
 * Extracts content from existing POIs and creates entries in poi_contents collection.
 * Maintains backward compatibility by keeping content in pois collection.
 *
 * Run: node scripts/phase2-migrate-content.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Poi = require('../src/models/poi.model');
const PoiContent = require('../src/models/poi-content.model');

const results = {
    timestamp: new Date().toISOString(),
    stats: {
        totalPois: 0,
        contentCreated: 0,
        contentSkipped: 0,
        errors: 0
    },
    details: [],
    errors: []
};

/**
 * Extract content from POI
 */
function extractContent(poi) {
    return {
        poiCode: poi.code,
        language: poi.languageCode || 'vi',
        title: poi.name,
        description: poi.summary || '',
        narrationShort: poi.narrationShort || '',
        narrationLong: poi.narrationLong || '',
        audioShortId: null,
        audioLongId: null,
        version: 1
    };
}

/**
 * Validate extracted content
 */
function validateContent(content, poiCode) {
    const errors = [];

    if (!content.poiCode) errors.push('Missing poiCode');
    if (!content.language) errors.push('Missing language');
    if (!content.title) errors.push('Missing title');
    if (!content.description) errors.push('Missing description');
    if (!content.narrationShort) errors.push('Missing narrationShort');
    if (!content.narrationLong) errors.push('Missing narrationLong');

    if (errors.length > 0) {
        return {
            valid: false,
            errors: errors.join(', ')
        };
    }

    return { valid: true };
}

/**
 * Migrate single POI content
 */
async function migratePoi(poi) {
    try {
        // Extract content
        const contentData = extractContent(poi);

        // Validate
        const validation = validateContent(contentData, poi.code);
        if (!validation.valid) {
            results.stats.errors++;
            results.errors.push(`${poi.code}: ${validation.errors}`);
            console.log(`   ❌ ${poi.code}: ${validation.errors}`);
            return;
        }

        // Check if content already exists
        const existing = await PoiContent.findOne({
            poiCode: contentData.poiCode,
            language: contentData.language
        });

        if (existing) {
            results.stats.contentSkipped++;
            console.log(`   ⚠️  ${poi.code}: Content already exists (skipped)`);
            return;
        }

        // Create content entry
        const content = new PoiContent(contentData);
        await content.save();

        results.stats.contentCreated++;
        results.details.push({
            poiCode: poi.code,
            language: contentData.language,
            status: 'CREATED'
        });

        console.log(`   ✅ ${poi.code}: Content created (${contentData.language})`);

    } catch (error) {
        results.stats.errors++;
        results.errors.push(`${poi.code}: ${error.message}`);
        console.error(`   ❌ ${poi.code}: ${error.message}`);
    }
}

/**
 * Migrate all POI content
 */
async function migrateAllContent() {
    console.log('\n========================================');
    console.log('STEP 1: EXTRACT AND MIGRATE CONTENT');
    console.log('========================================\n');

    // Get all POIs
    const pois = await Poi.find({}).lean();
    results.stats.totalPois = pois.length;

    console.log(`Found ${pois.length} POIs to migrate\n`);

    // Migrate each POI
    for (const poi of pois) {
        await migratePoi(poi);
    }

    console.log(`\n✅ Migration complete`);
    console.log(`   Created: ${results.stats.contentCreated}`);
    console.log(`   Skipped: ${results.stats.contentSkipped}`);
    console.log(`   Errors: ${results.stats.errors}`);
}

/**
 * Verify migration
 */
async function verifyMigration() {
    console.log('\n========================================');
    console.log('STEP 2: VERIFY MIGRATION');
    console.log('========================================\n');

    // Count POIs and content entries
    const poiCount = await Poi.countDocuments({});
    const contentCount = await PoiContent.countDocuments({});

    console.log(`POIs in database: ${poiCount}`);
    console.log(`Content entries: ${contentCount}`);

    // Check for POIs without content
    const pois = await Poi.find({}).lean();
    const missingContent = [];

    for (const poi of pois) {
        const content = await PoiContent.findOne({ poiCode: poi.code });
        if (!content) {
            missingContent.push(poi.code);
        }
    }

    if (missingContent.length > 0) {
        console.log(`\n⚠️  POIs without content: ${missingContent.length}`);
        missingContent.forEach(code => {
            console.log(`   - ${code}`);
        });
    } else {
        console.log(`\n✅ All POIs have content entries`);
    }

    // Check for duplicate content
    const duplicates = await PoiContent.aggregate([
        { $group: { _id: { poiCode: '$poiCode', language: '$language' }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } }
    ]);

    if (duplicates.length > 0) {
        console.log(`\n⚠️  Duplicate content entries: ${duplicates.length}`);
        duplicates.forEach(dup => {
            console.log(`   - ${dup._id.poiCode} (${dup._id.language}): ${dup.count} entries`);
        });
    } else {
        console.log(`✅ No duplicate content entries`);
    }

    // Language distribution
    const languages = await PoiContent.aggregate([
        { $group: { _id: '$language', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]);

    console.log(`\n📊 Language distribution:`);
    languages.forEach(lang => {
        console.log(`   ${lang._id}: ${lang.count} entries`);
    });

    return {
        poiCount,
        contentCount,
        missingContent: missingContent.length,
        duplicates: duplicates.length
    };
}

/**
 * Test content retrieval
 */
async function testContentRetrieval() {
    console.log('\n========================================');
    console.log('STEP 3: TEST CONTENT RETRIEVAL');
    console.log('========================================\n');

    // Get first POI
    const poi = await Poi.findOne({}).lean();
    if (!poi) {
        console.log('⚠️  No POIs found for testing');
        return;
    }

    console.log(`Testing with POI: ${poi.code}\n`);

    // Test Vietnamese content
    const viContent = await PoiContent.findOne({ poiCode: poi.code, language: 'vi' });
    if (viContent) {
        console.log('✅ Vietnamese content retrieved:');
        console.log(`   Title: ${viContent.title}`);
        console.log(`   Description: ${viContent.description.substring(0, 50)}...`);
    } else {
        console.log('❌ Vietnamese content not found');
    }

    // Test fallback (non-existent language)
    const enContent = await PoiContent.findOne({ poiCode: poi.code, language: 'en' });
    if (!enContent) {
        console.log('\n✅ Fallback test passed (en content not found, as expected)');
    }

    // Test query performance
    const startTime = Date.now();
    await PoiContent.findOne({ poiCode: poi.code, language: 'vi' });
    const queryTime = Date.now() - startTime;

    console.log(`\n📈 Query performance: ${queryTime}ms`);
    if (queryTime < 50) {
        console.log('✅ Performance acceptable (<50ms)');
    } else {
        console.log('⚠️  Performance warning (>50ms)');
    }
}

/**
 * Print final report
 */
function printFinalReport(verification) {
    console.log('\n========================================');
    console.log('PHASE 2C: FINAL REPORT');
    console.log('========================================\n');

    console.log('📊 MIGRATION STATISTICS:\n');
    console.log(`   Total POIs: ${results.stats.totalPois}`);
    console.log(`   Content Created: ${results.stats.contentCreated}`);
    console.log(`   Content Skipped: ${results.stats.contentSkipped}`);
    console.log(`   Errors: ${results.stats.errors}`);

    console.log('\n📊 VERIFICATION RESULTS:\n');
    console.log(`   POIs in database: ${verification.poiCount}`);
    console.log(`   Content entries: ${verification.contentCount}`);
    console.log(`   POIs without content: ${verification.missingContent}`);
    console.log(`   Duplicate entries: ${verification.duplicates}`);

    if (results.errors.length > 0) {
        console.log('\n❌ ERRORS:\n');
        results.errors.forEach((err, i) => {
            console.log(`   ${i + 1}. ${err}`);
        });
    }

    console.log('\n========================================');
    console.log('PHASE 2C: COMPLETE');
    console.log('========================================\n');

    const success = results.stats.errors === 0 &&
                   verification.missingContent === 0 &&
                   verification.duplicates === 0;

    if (success) {
        console.log('✅ All content migrated successfully');
        console.log('✅ All POIs have content entries');
        console.log('✅ No duplicates found');
        console.log('✅ Verification passed\n');
        console.log('Next step: Run phase2-generate-language-packs.js\n');
    } else {
        console.log('⚠️  Phase 2C completed with warnings');
        console.log('⚠️  Review issues above before proceeding\n');
    }
}

/**
 * Main execution
 */
async function runPhase2C() {
    console.log('\n========================================');
    console.log('PHASE 2C: MIGRATE CONTENT');
    console.log('========================================');
    console.log(`Timestamp: ${results.timestamp}`);
    console.log('Engineer: Senior System Architect\n');

    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGO_URI;
        if (!mongoUri) {
            throw new Error('MONGO_URI environment variable is required');
        }

        console.log('📡 Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✅ Connected\n');

        // Verify collections exist
        const collections = await mongoose.connection.db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);

        if (!collectionNames.includes('poi_contents')) {
            throw new Error('poi_contents collection not found. Run phase2-create-collections.js first.');
        }

        // Migrate content
        await migrateAllContent();

        // Verify migration
        const verification = await verifyMigration();

        // Test retrieval
        await testContentRetrieval();

        // Print report
        printFinalReport(verification);

    } catch (error) {
        console.error('\n❌ PHASE 2C FAILED:', error.message);
        results.errors.push(`Fatal: ${error.message}`);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('📡 Disconnected from MongoDB\n');
    }
}

// Run Phase 2C
runPhase2C().then(() => {
    process.exit(results.errors.length > 0 ? 1 : 0);
});
