/**
 * PHASE 2A: CREATE NEW COLLECTIONS
 *
 * Creates poi_contents, audio_assets, and language_packs collections
 * with proper indexes and schema validation.
 *
 * Run: node scripts/phase2-create-collections.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const PoiContent = require('../src/models/poi-content.model');
const AudioAsset = require('../src/models/audio-asset.model');
const LanguagePack = require('../src/models/language-pack.model');

const results = {
    timestamp: new Date().toISOString(),
    collections: {
        poi_contents: { created: false, indexes: [] },
        audio_assets: { created: false, indexes: [] },
        language_packs: { created: false, indexes: [] }
    },
    errors: []
};

/**
 * Check if collection exists
 */
async function collectionExists(collectionName) {
    const collections = await mongoose.connection.db.listCollections({ name: collectionName }).toArray();
    return collections.length > 0;
}

/**
 * Create poi_contents collection
 */
async function createPoiContentsCollection() {
    console.log('\n========================================');
    console.log('STEP 1: CREATE POI_CONTENTS COLLECTION');
    console.log('========================================\n');

    try {
        const exists = await collectionExists('poi_contents');

        if (exists) {
            console.log('⚠️  Collection poi_contents already exists');
            results.collections.poi_contents.created = false;
        } else {
            await mongoose.connection.db.createCollection('poi_contents');
            console.log('✅ Collection poi_contents created');
            results.collections.poi_contents.created = true;
        }

        // Ensure indexes
        console.log('\nCreating indexes...');
        await PoiContent.createIndexes();

        const indexes = await PoiContent.collection.getIndexes();
        results.collections.poi_contents.indexes = Object.keys(indexes);

        console.log('✅ Indexes created:');
        Object.keys(indexes).forEach(idx => {
            console.log(`   - ${idx}`);
        });

        // Validate schema
        console.log('\nValidating schema...');
        const testDoc = new PoiContent({
            poiCode: 'TEST_POI',
            language: 'vi',
            title: 'Test POI',
            description: 'Test description',
            narrationShort: 'Short narration',
            narrationLong: 'Long narration',
            version: 1
        });

        const validationError = testDoc.validateSync();
        if (validationError) {
            throw new Error(`Schema validation failed: ${validationError.message}`);
        }

        console.log('✅ Schema validation passed');

    } catch (error) {
        console.error('❌ Error creating poi_contents:', error.message);
        results.errors.push(`poi_contents: ${error.message}`);
        throw error;
    }
}

/**
 * Create audio_assets collection
 */
async function createAudioAssetsCollection() {
    console.log('\n========================================');
    console.log('STEP 2: CREATE AUDIO_ASSETS COLLECTION');
    console.log('========================================\n');

    try {
        const exists = await collectionExists('audio_assets');

        if (exists) {
            console.log('⚠️  Collection audio_assets already exists');
            results.collections.audio_assets.created = false;
        } else {
            await mongoose.connection.db.createCollection('audio_assets');
            console.log('✅ Collection audio_assets created');
            results.collections.audio_assets.created = true;
        }

        // Ensure indexes
        console.log('\nCreating indexes...');
        await AudioAsset.createIndexes();

        const indexes = await AudioAsset.collection.getIndexes();
        results.collections.audio_assets.indexes = Object.keys(indexes);

        console.log('✅ Indexes created:');
        Object.keys(indexes).forEach(idx => {
            console.log(`   - ${idx}`);
        });

        // Validate schema
        console.log('\nValidating schema...');
        const testDoc = new AudioAsset({
            url: 'https://cdn.example.com/audio/test.mp3',
            duration: 30,
            language: 'vi',
            format: 'mp3',
            fileSize: 524288,
            checksum: 'abc123def456'
        });

        const validationError = testDoc.validateSync();
        if (validationError) {
            throw new Error(`Schema validation failed: ${validationError.message}`);
        }

        console.log('✅ Schema validation passed');

    } catch (error) {
        console.error('❌ Error creating audio_assets:', error.message);
        results.errors.push(`audio_assets: ${error.message}`);
        throw error;
    }
}

/**
 * Create language_packs collection
 */
async function createLanguagePacksCollection() {
    console.log('\n========================================');
    console.log('STEP 3: CREATE LANGUAGE_PACKS COLLECTION');
    console.log('========================================\n');

    try {
        const exists = await collectionExists('language_packs');

        if (exists) {
            console.log('⚠️  Collection language_packs already exists');
            results.collections.language_packs.created = false;
        } else {
            await mongoose.connection.db.createCollection('language_packs');
            console.log('✅ Collection language_packs created');
            results.collections.language_packs.created = true;
        }

        // Ensure indexes
        console.log('\nCreating indexes...');
        await LanguagePack.createIndexes();

        const indexes = await LanguagePack.collection.getIndexes();
        results.collections.language_packs.indexes = Object.keys(indexes);

        console.log('✅ Indexes created:');
        Object.keys(indexes).forEach(idx => {
            console.log(`   - ${idx}`);
        });

        // Validate schema
        console.log('\nValidating schema...');
        const testDoc = new LanguagePack({
            language: 'vi',
            version: 1,
            totalSize: 1024,
            poiCount: 1,
            contents: [
                {
                    poiCode: 'TEST_POI',
                    title: 'Test',
                    description: 'Test',
                    narrationShort: 'Short',
                    narrationLong: 'Long'
                }
            ]
        });

        const validationError = testDoc.validateSync();
        if (validationError) {
            throw new Error(`Schema validation failed: ${validationError.message}`);
        }

        console.log('✅ Schema validation passed');

    } catch (error) {
        console.error('❌ Error creating language_packs:', error.message);
        results.errors.push(`language_packs: ${error.message}`);
        throw error;
    }
}

/**
 * Verify collections
 */
async function verifyCollections() {
    console.log('\n========================================');
    console.log('STEP 4: VERIFY COLLECTIONS');
    console.log('========================================\n');

    const allCollections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = allCollections.map(c => c.name);

    console.log('All collections in database:');
    collectionNames.forEach(name => {
        const marker = ['poi_contents', 'audio_assets', 'language_packs'].includes(name) ? '✅' : '  ';
        console.log(`${marker} ${name}`);
    });

    // Verify required collections exist
    const required = ['poi_contents', 'audio_assets', 'language_packs'];
    const missing = required.filter(name => !collectionNames.includes(name));

    if (missing.length > 0) {
        throw new Error(`Missing collections: ${missing.join(', ')}`);
    }

    console.log('\n✅ All required collections exist');
}

/**
 * Print final report
 */
function printFinalReport() {
    console.log('\n========================================');
    console.log('PHASE 2A: FINAL REPORT');
    console.log('========================================\n');

    console.log('📊 COLLECTIONS CREATED:\n');
    Object.entries(results.collections).forEach(([name, info]) => {
        const icon = info.created ? '✅' : '⚠️';
        const status = info.created ? 'CREATED' : 'ALREADY EXISTS';
        console.log(`   ${icon} ${name}: ${status}`);
        console.log(`      Indexes: ${info.indexes.length}`);
        info.indexes.forEach(idx => {
            console.log(`         - ${idx}`);
        });
    });

    if (results.errors.length > 0) {
        console.log('\n❌ ERRORS:\n');
        results.errors.forEach((err, i) => {
            console.log(`   ${i + 1}. ${err}`);
        });
    }

    console.log('\n========================================');
    console.log('PHASE 2A: COMPLETE');
    console.log('========================================\n');

    if (results.errors.length === 0) {
        console.log('✅ All collections created successfully');
        console.log('✅ All indexes created');
        console.log('✅ Schema validation passed\n');
        console.log('Next step: Run phase2-migrate-content.js to backfill content\n');
    } else {
        console.log('❌ Phase 2A completed with errors');
        console.log('⚠️  Review errors above before proceeding\n');
    }
}

/**
 * Main execution
 */
async function runPhase2A() {
    console.log('\n========================================');
    console.log('PHASE 2A: CREATE NEW COLLECTIONS');
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

        // Create collections
        await createPoiContentsCollection();
        await createAudioAssetsCollection();
        await createLanguagePacksCollection();

        // Verify
        await verifyCollections();

        // Print report
        printFinalReport();

    } catch (error) {
        console.error('\n❌ PHASE 2A FAILED:', error.message);
        results.errors.push(`Fatal: ${error.message}`);
        printFinalReport();
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('📡 Disconnected from MongoDB\n');
    }
}

// Run Phase 2A
runPhase2A().then(() => {
    process.exit(results.errors.length > 0 ? 1 : 0);
});
