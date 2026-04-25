/**
 * PHASE 2C: IMPORT EXISTING CONTENT
 *
 * Imports content from backend/mongo/migrated/poi_contents.json
 * and maps it to the new poi_contents schema.
 *
 * Run: node scripts/phase2-import-existing-content.js
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Poi = require('../src/models/poi.model');
const PoiContent = require('../src/models/poi-content.model');

const results = {
    timestamp: new Date().toISOString(),
    stats: {
        totalContent: 0,
        imported: 0,
        skipped: 0,
        errors: 0
    },
    errors: []
};

/**
 * Load existing content from JSON file
 */
function loadExistingContent() {
    const filePath = path.join(__dirname, '../mongo/migrated/poi_contents.json');

    if (!fs.existsSync(filePath)) {
        throw new Error(`Content file not found: ${filePath}`);
    }

    const rawData = fs.readFileSync(filePath, 'utf8');
    const content = JSON.parse(rawData);

    return content;
}

/**
 * Import content
 */
async function importContent() {
    console.log('\n========================================');
    console.log('PHASE 2C: IMPORT EXISTING CONTENT');
    console.log('========================================\n');

    // Load existing content
    const existingContent = loadExistingContent();
    results.stats.totalContent = existingContent.length;

    console.log(`Found ${existingContent.length} content entries to import\n`);

    // Create POI ID to code mapping
    const pois = await Poi.find({}).lean();
    const poiIdToCode = {};

    pois.forEach(poi => {
        poiIdToCode[poi._id.toString()] = poi.code;
    });

    console.log(`Loaded ${pois.length} POIs for mapping\n`);

    // Import each content entry
    for (const oldContent of existingContent) {
        try {
            const poiId = oldContent.poiId.$oid;
            const poiCode = poiIdToCode[poiId];

            if (!poiCode) {
                results.stats.errors++;
                results.errors.push(`POI not found for ID: ${poiId}`);
                console.log(`   ❌ POI not found for ID: ${poiId}`);
                continue;
            }

            // Check if content already exists
            const existing = await PoiContent.findOne({
                poiCode,
                language: oldContent.languageCode
            });

            if (existing) {
                results.stats.skipped++;
                console.log(`   ⚠️  ${poiCode}: Content already exists (skipped)`);
                continue;
            }

            // Create new content entry
            const newContent = new PoiContent({
                poiCode,
                language: oldContent.languageCode,
                title: oldContent.name || '',
                description: oldContent.summary || oldContent.description || '',
                narrationShort: oldContent.narrationShort || oldContent.summary || '',
                narrationLong: oldContent.narrationLong || oldContent.description || oldContent.summary || '',
                version: oldContent.version || 1
            });

            await newContent.save();

            results.stats.imported++;
            console.log(`   ✅ ${poiCode}: Content imported (${oldContent.languageCode})`);

        } catch (error) {
            results.stats.errors++;
            results.errors.push(`Error importing content: ${error.message}`);
            console.error(`   ❌ Error: ${error.message}`);
        }
    }

    console.log(`\n✅ Import complete`);
    console.log(`   Imported: ${results.stats.imported}`);
    console.log(`   Skipped: ${results.stats.skipped}`);
    console.log(`   Errors: ${results.stats.errors}`);
}

/**
 * Verify import
 */
async function verifyImport() {
    console.log('\n========================================');
    console.log('VERIFY IMPORT');
    console.log('========================================\n');

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
        missingContent.slice(0, 5).forEach(code => {
            console.log(`   - ${code}`);
        });
        if (missingContent.length > 5) {
            console.log(`   ... and ${missingContent.length - 5} more`);
        }
    } else {
        console.log(`\n✅ All POIs have content entries`);
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
        missingContent: missingContent.length
    };
}

/**
 * Print final report
 */
function printFinalReport(verification) {
    console.log('\n========================================');
    console.log('FINAL REPORT');
    console.log('========================================\n');

    console.log('📊 IMPORT STATISTICS:\n');
    console.log(`   Total content entries: ${results.stats.totalContent}`);
    console.log(`   Imported: ${results.stats.imported}`);
    console.log(`   Skipped: ${results.stats.skipped}`);
    console.log(`   Errors: ${results.stats.errors}`);

    console.log('\n📊 VERIFICATION:\n');
    console.log(`   POIs: ${verification.poiCount}`);
    console.log(`   Content entries: ${verification.contentCount}`);
    console.log(`   POIs without content: ${verification.missingContent}`);

    if (results.errors.length > 0) {
        console.log('\n❌ ERRORS:\n');
        results.errors.forEach((err, i) => {
            console.log(`   ${i + 1}. ${err}`);
        });
    }

    console.log('\n========================================');

    const success = results.stats.errors === 0 && verification.missingContent === 0;

    if (success) {
        console.log('✅ Content import successful');
        console.log('✅ All POIs have content entries');
        console.log('\nNext step: Run phase2-generate-language-packs.js\n');
    } else {
        console.log('⚠️  Content import completed with issues');
        console.log('⚠️  Review errors above\n');
    }
}

/**
 * Main execution
 */
async function runImport() {
    console.log('\n========================================');
    console.log('IMPORT EXISTING CONTENT');
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

        // Import content
        await importContent();

        // Verify import
        const verification = await verifyImport();

        // Print report
        printFinalReport(verification);

    } catch (error) {
        console.error('\n❌ IMPORT FAILED:', error.message);
        results.errors.push(`Fatal: ${error.message}`);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('📡 Disconnected from MongoDB\n');
    }
}

// Run import
runImport().then(() => {
    process.exit(results.errors.length > 0 ? 1 : 0);
});
