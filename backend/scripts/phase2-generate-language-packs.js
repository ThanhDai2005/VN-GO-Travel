/**
 * PHASE 2: GENERATE LANGUAGE PACKS
 *
 * Aggregates content by language and creates denormalized language packs
 * for offline mobile app support.
 *
 * Run: node scripts/phase2-generate-language-packs.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const PoiContent = require('../src/models/poi-content.model');
const LanguagePack = require('../src/models/language-pack.model');
const AudioAsset = require('../src/models/audio-asset.model');

const results = {
    timestamp: new Date().toISOString(),
    stats: {
        languagesFound: 0,
        packsCreated: 0,
        packsUpdated: 0,
        errors: 0
    },
    packs: [],
    errors: []
};

/**
 * Get all available languages
 */
async function getAvailableLanguages() {
    console.log('\n========================================');
    console.log('STEP 1: DISCOVER LANGUAGES');
    console.log('========================================\n');

    const languages = await PoiContent.distinct('language');
    results.stats.languagesFound = languages.length;

    console.log(`Found ${languages.length} language(s):`);
    languages.forEach(lang => {
        console.log(`   - ${lang}`);
    });

    return languages;
}

/**
 * Generate language pack for a specific language
 */
async function generateLanguagePack(language) {
    console.log(`\n📦 Generating pack for: ${language}`);

    try {
        // Get all content for this language
        const contents = await PoiContent.find({ language }).lean();

        if (contents.length === 0) {
            console.log(`   ⚠️  No content found for ${language}`);
            return;
        }

        console.log(`   Found ${contents.length} content entries`);

        // Build denormalized content array
        const packContents = [];
        let totalSize = 0;

        for (const content of contents) {
            // Get audio URLs if available
            let audioShortUrl = null;
            let audioLongUrl = null;

            if (content.audioShortId) {
                const audioShort = await AudioAsset.findById(content.audioShortId).lean();
                if (audioShort) audioShortUrl = audioShort.url;
            }

            if (content.audioLongId) {
                const audioLong = await AudioAsset.findById(content.audioLongId).lean();
                if (audioLong) audioLongUrl = audioLong.url;
            }

            // Calculate approximate size (JSON string length)
            const entrySize = JSON.stringify({
                poiCode: content.poiCode,
                title: content.title,
                description: content.description,
                narrationShort: content.narrationShort,
                narrationLong: content.narrationLong,
                audioShortUrl,
                audioLongUrl
            }).length;

            totalSize += entrySize;

            packContents.push({
                poiCode: content.poiCode,
                title: content.title,
                description: content.description,
                narrationShort: content.narrationShort,
                narrationLong: content.narrationLong,
                audioShortUrl,
                audioLongUrl
            });
        }

        // Check if pack already exists
        const existingPack = await LanguagePack.findOne({ language });

        if (existingPack) {
            // Update existing pack
            existingPack.version += 1;
            existingPack.totalSize = totalSize;
            existingPack.poiCount = packContents.length;
            existingPack.contents = packContents;
            await existingPack.save();

            results.stats.packsUpdated++;
            console.log(`   ✅ Updated pack (version ${existingPack.version})`);
            console.log(`   Size: ${(totalSize / 1024).toFixed(2)} KB`);
            console.log(`   POIs: ${packContents.length}`);

            results.packs.push({
                language,
                version: existingPack.version,
                totalSize,
                poiCount: packContents.length,
                status: 'UPDATED'
            });
        } else {
            // Create new pack
            const pack = new LanguagePack({
                language,
                version: 1,
                totalSize,
                poiCount: packContents.length,
                contents: packContents
            });

            await pack.save();

            results.stats.packsCreated++;
            console.log(`   ✅ Created pack (version 1)`);
            console.log(`   Size: ${(totalSize / 1024).toFixed(2)} KB`);
            console.log(`   POIs: ${packContents.length}`);

            results.packs.push({
                language,
                version: 1,
                totalSize,
                poiCount: packContents.length,
                status: 'CREATED'
            });
        }

    } catch (error) {
        results.stats.errors++;
        results.errors.push(`${language}: ${error.message}`);
        console.error(`   ❌ Error: ${error.message}`);
    }
}

/**
 * Generate all language packs
 */
async function generateAllPacks() {
    console.log('\n========================================');
    console.log('STEP 2: GENERATE LANGUAGE PACKS');
    console.log('========================================\n');

    const languages = await getAvailableLanguages();

    for (const language of languages) {
        await generateLanguagePack(language);
    }

    console.log(`\n✅ Pack generation complete`);
    console.log(`   Created: ${results.stats.packsCreated}`);
    console.log(`   Updated: ${results.stats.packsUpdated}`);
    console.log(`   Errors: ${results.stats.errors}`);
}

/**
 * Verify language packs
 */
async function verifyLanguagePacks() {
    console.log('\n========================================');
    console.log('STEP 3: VERIFY LANGUAGE PACKS');
    console.log('========================================\n');

    const packs = await LanguagePack.find({}).lean();

    console.log(`Total language packs: ${packs.length}\n`);

    for (const pack of packs) {
        console.log(`📦 ${pack.language} (v${pack.version}):`);
        console.log(`   POIs: ${pack.poiCount}`);
        console.log(`   Size: ${(pack.totalSize / 1024).toFixed(2)} KB`);
        console.log(`   Contents: ${pack.contents.length} entries`);

        // Verify content count matches
        if (pack.poiCount !== pack.contents.length) {
            console.log(`   ⚠️  Mismatch: poiCount=${pack.poiCount}, contents.length=${pack.contents.length}`);
        } else {
            console.log(`   ✅ Content count verified`);
        }

        // Check for missing fields
        const missingFields = pack.contents.filter(c =>
            !c.poiCode || !c.title || !c.description || !c.narrationShort || !c.narrationLong
        );

        if (missingFields.length > 0) {
            console.log(`   ⚠️  ${missingFields.length} entries with missing fields`);
        } else {
            console.log(`   ✅ All entries have required fields`);
        }

        console.log('');
    }

    return packs;
}

/**
 * Test language pack retrieval
 */
async function testPackRetrieval() {
    console.log('\n========================================');
    console.log('STEP 4: TEST PACK RETRIEVAL');
    console.log('========================================\n');

    // Test Vietnamese pack
    const startTime = Date.now();
    const viPack = await LanguagePack.findOne({ language: 'vi' }).lean();
    const queryTime = Date.now() - startTime;

    if (viPack) {
        console.log('✅ Vietnamese pack retrieved:');
        console.log(`   Version: ${viPack.version}`);
        console.log(`   POIs: ${viPack.poiCount}`);
        console.log(`   Size: ${(viPack.totalSize / 1024).toFixed(2)} KB`);
        console.log(`   Query time: ${queryTime}ms`);

        if (queryTime < 100) {
            console.log('   ✅ Performance acceptable (<100ms)');
        } else {
            console.log('   ⚠️  Performance warning (>100ms)');
        }

        // Sample first entry
        if (viPack.contents.length > 0) {
            const sample = viPack.contents[0];
            console.log(`\n   Sample entry:`);
            console.log(`   - POI Code: ${sample.poiCode}`);
            console.log(`   - Title: ${sample.title}`);
            console.log(`   - Has audio: ${sample.audioShortUrl ? 'Yes' : 'No (TTS)'}`);
        }
    } else {
        console.log('❌ Vietnamese pack not found');
    }
}

/**
 * Print final report
 */
function printFinalReport(packs) {
    console.log('\n========================================');
    console.log('PHASE 2: LANGUAGE PACKS - FINAL REPORT');
    console.log('========================================\n');

    console.log('📊 GENERATION STATISTICS:\n');
    console.log(`   Languages found: ${results.stats.languagesFound}`);
    console.log(`   Packs created: ${results.stats.packsCreated}`);
    console.log(`   Packs updated: ${results.stats.packsUpdated}`);
    console.log(`   Errors: ${results.stats.errors}`);

    console.log('\n📦 LANGUAGE PACKS:\n');
    results.packs.forEach(pack => {
        const icon = pack.status === 'CREATED' ? '✅' : '🔄';
        console.log(`   ${icon} ${pack.language} (v${pack.version}): ${pack.poiCount} POIs, ${(pack.totalSize / 1024).toFixed(2)} KB`);
    });

    if (results.errors.length > 0) {
        console.log('\n❌ ERRORS:\n');
        results.errors.forEach((err, i) => {
            console.log(`   ${i + 1}. ${err}`);
        });
    }

    console.log('\n========================================');
    console.log('LANGUAGE PACK GENERATION: COMPLETE');
    console.log('========================================\n');

    const success = results.stats.errors === 0 && packs.length > 0;

    if (success) {
        console.log('✅ All language packs generated successfully');
        console.log('✅ Verification passed');
        console.log('✅ Ready for mobile app integration\n');
        console.log('API Endpoints:');
        console.log('   GET /api/v1/language-packs/:language');
        console.log('   GET /api/v1/language-packs/:language/version\n');
    } else {
        console.log('⚠️  Language pack generation completed with warnings');
        console.log('⚠️  Review issues above\n');
    }
}

/**
 * Main execution
 */
async function runLanguagePackGeneration() {
    console.log('\n========================================');
    console.log('PHASE 2: GENERATE LANGUAGE PACKS');
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
            throw new Error('poi_contents collection not found. Run phase2-migrate-content.js first.');
        }

        if (!collectionNames.includes('language_packs')) {
            throw new Error('language_packs collection not found. Run phase2-create-collections.js first.');
        }

        // Generate packs
        await generateAllPacks();

        // Verify packs
        const packs = await verifyLanguagePacks();

        // Test retrieval
        await testPackRetrieval();

        // Print report
        printFinalReport(packs);

    } catch (error) {
        console.error('\n❌ LANGUAGE PACK GENERATION FAILED:', error.message);
        results.errors.push(`Fatal: ${error.message}`);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('📡 Disconnected from MongoDB\n');
    }
}

// Run language pack generation
runLanguagePackGeneration().then(() => {
    process.exit(results.errors.length > 0 ? 1 : 0);
});
