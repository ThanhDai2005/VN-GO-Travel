/**
 * POI MIGRATION FIX SCRIPT
 *
 * This script applies fixes to POI data based on audit results.
 * It handles:
 * - Coordinate normalization
 * - Duplicate resolution
 * - Missing field defaults
 * - Legacy content cleanup
 * - Index creation
 *
 * SAFETY: Run poi-audit-and-migration.js first to see what will be changed.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Poi = require('../src/models/poi.model');

// Vietnam boundaries
const VIETNAM_BOUNDS = {
    minLat: 8.5,
    maxLat: 23.4,
    minLng: 102.1,
    maxLng: 114.0
};

// Migration statistics
const stats = {
    processed: 0,
    fixed: 0,
    deleted: 0,
    merged: 0,
    errors: []
};

/**
 * Fix out-of-bounds coordinates
 */
async function fixOutOfBounds() {
    console.log('\n🔧 Fixing out-of-bounds POIs...');

    const outOfBoundsPois = await Poi.find({}).lean();

    for (const poi of outOfBoundsPois) {
        if (!poi.location?.coordinates) continue;

        const [lng, lat] = poi.location.coordinates;

        if (lat < VIETNAM_BOUNDS.minLat || lat > VIETNAM_BOUNDS.maxLat ||
            lng < VIETNAM_BOUNDS.minLng || lng > VIETNAM_BOUNDS.maxLng) {

            console.log(`   ⚠️  POI ${poi.code} is out of bounds: [${lat}, ${lng}]`);

            // Special case: Fix known incorrect coordinates
            if (poi.code === 'ha-long') {
                console.log(`      Fixing Hạ Long Bay coordinates...`);
                await Poi.updateOne(
                    { _id: poi._id },
                    {
                        $set: {
                            'location.coordinates': [107.0843, 20.9101],
                            name: 'Vịnh Hạ Long',
                            summary: 'Di sản thiên nhiên thế giới UNESCO',
                            narrationShort: 'Bạn đang đến gần Vịnh Hạ Long, một trong những kỳ quan thiên nhiên của thế giới.',
                            narrationLong: 'Vịnh Hạ Long là di sản thiên nhiên thế giới được UNESCO công nhận, nổi tiếng với hàng nghìn hòn đảo đá vôi nhô lên từ mặt nước xanh biếc.',
                            radius: 500,
                            priority: 5
                        }
                    }
                );
                stats.fixed++;
            } else if (poi.code === 'CHUA-BAI-DINH') {
                console.log(`      Fixing Chùa Bái Đính coordinates...`);
                await Poi.updateOne(
                    { _id: poi._id },
                    {
                        $set: {
                            'location.coordinates': [105.9167, 20.2500],
                            radius: 200
                        }
                    }
                );
                stats.fixed++;
            } else {
                // Delete invalid POIs that can't be fixed
                console.log(`      ❌ Deleting invalid POI: ${poi.code}`);
                await Poi.deleteOne({ _id: poi._id });
                stats.deleted++;
            }
        }
    }

    console.log(`   ✅ Fixed/deleted ${stats.fixed + stats.deleted} out-of-bounds POIs`);
}

/**
 * Fix missing or invalid radius
 */
async function fixRadius() {
    console.log('\n🔧 Fixing radius values...');

    // Fix missing radius
    const missingRadius = await Poi.updateMany(
        { $or: [{ radius: null }, { radius: { $exists: false } }] },
        { $set: { radius: 50 } }
    );
    console.log(`   Fixed ${missingRadius.modifiedCount} POIs with missing radius (set to 50m)`);

    // Fix invalid radius
    const invalidRadius = await Poi.updateMany(
        { $or: [{ radius: { $lte: 0 } }, { radius: { $gt: 100000 } }] },
        { $set: { radius: 100 } }
    );
    console.log(`   Fixed ${invalidRadius.modifiedCount} POIs with invalid radius (set to 100m)`);

    stats.fixed += missingRadius.modifiedCount + invalidRadius.modifiedCount;
}

/**
 * Fix missing required fields
 */
async function fixMissingFields() {
    console.log('\n🔧 Fixing missing required fields...');

    // Fix missing languageCode
    const missingLang = await Poi.updateMany(
        { $or: [{ languageCode: null }, { languageCode: { $exists: false } }] },
        { $set: { languageCode: 'vi' } }
    );
    console.log(`   Fixed ${missingLang.modifiedCount} POIs with missing languageCode`);

    // Fix missing priority
    const missingPriority = await Poi.updateMany(
        { $or: [{ priority: null }, { priority: { $exists: false } }] },
        { $set: { priority: 0 } }
    );
    console.log(`   Fixed ${missingPriority.modifiedCount} POIs with missing priority`);

    // Fix missing status
    const missingStatus = await Poi.updateMany(
        { $or: [{ status: null }, { status: { $exists: false } }] },
        { $set: { status: 'APPROVED' } }
    );
    console.log(`   Fixed ${missingStatus.modifiedCount} POIs with missing status`);

    stats.fixed += missingLang.modifiedCount + missingPriority.modifiedCount + missingStatus.modifiedCount;
}

/**
 * Remove legacy content field
 */
async function cleanLegacyContent() {
    console.log('\n🔧 Cleaning legacy content fields...');

    const result = await Poi.updateMany(
        { content: { $ne: null } },
        { $set: { content: null } }
    );

    console.log(`   Cleaned ${result.modifiedCount} POIs with legacy content field`);
    stats.fixed += result.modifiedCount;
}

/**
 * Resolve duplicate codes
 */
async function resolveDuplicates() {
    console.log('\n🔧 Resolving duplicate codes...');

    const pois = await Poi.find({}).lean();
    const codeMap = new Map();
    const duplicates = [];

    // Find duplicates
    pois.forEach(poi => {
        const code = poi.code.toUpperCase();
        if (codeMap.has(code)) {
            duplicates.push({
                code: poi.code,
                existing: codeMap.get(code),
                duplicate: poi
            });
        } else {
            codeMap.set(code, poi);
        }
    });

    if (duplicates.length === 0) {
        console.log('   ✅ No duplicates found');
        return;
    }

    console.log(`   Found ${duplicates.length} duplicate codes`);

    for (const dup of duplicates) {
        console.log(`   Merging duplicate: ${dup.code}`);

        // Keep the one with more complete data (more fields filled)
        const existingScore = Object.values(dup.existing).filter(v => v !== null && v !== '').length;
        const duplicateScore = Object.values(dup.duplicate).filter(v => v !== null && v !== '').length;

        let keepId, deleteId;
        if (existingScore >= duplicateScore) {
            keepId = dup.existing._id;
            deleteId = dup.duplicate._id;
        } else {
            keepId = dup.duplicate._id;
            deleteId = dup.existing._id;
        }

        console.log(`      Keeping: ${keepId}, Deleting: ${deleteId}`);
        await Poi.deleteOne({ _id: deleteId });
        stats.merged++;
    }

    console.log(`   ✅ Merged ${stats.merged} duplicate POIs`);
}

/**
 * Ensure indexes exist
 */
async function ensureIndexes() {
    console.log('\n🔧 Ensuring indexes...');

    try {
        // Check existing indexes
        const existingIndexes = await Poi.collection.getIndexes();
        console.log('   Current indexes:', Object.keys(existingIndexes));

        // Create code index if missing
        try {
            await Poi.collection.createIndex({ code: 1 }, { unique: true, name: 'idx_code_unique' });
            console.log('   ✅ Created unique index on code');
        } catch (err) {
            if (err.code === 85) {
                console.log('   ℹ️  Code index already exists');
            } else {
                throw err;
            }
        }

        // Create geospatial index if missing
        try {
            await Poi.collection.createIndex({ location: '2dsphere' }, { name: 'idx_location_2dsphere' });
            console.log('   ✅ Created 2dsphere index on location');
        } catch (err) {
            if (err.code === 85) {
                console.log('   ℹ️  Geospatial index already exists');
            } else {
                throw err;
            }
        }

        // Create compound index for status queries
        try {
            await Poi.collection.createIndex({ code: 1, status: 1 }, { name: 'idx_code_status' });
            console.log('   ✅ Created compound index on code + status');
        } catch (err) {
            if (err.code === 85) {
                console.log('   ℹ️  Compound index already exists');
            } else {
                throw err;
            }
        }

    } catch (error) {
        console.error('   ❌ Error creating indexes:', error.message);
        stats.errors.push({ step: 'ensureIndexes', error: error.message });
    }
}

/**
 * Validate final state
 */
async function validateFinalState() {
    console.log('\n🔍 Validating final state...');

    const totalPois = await Poi.countDocuments({});
    console.log(`   Total POIs: ${totalPois}`);

    // Check for invalid coordinates
    const allPois = await Poi.find({}).lean();
    let invalidCount = 0;

    for (const poi of allPois) {
        const [lng, lat] = poi.location.coordinates;

        if (lat < VIETNAM_BOUNDS.minLat || lat > VIETNAM_BOUNDS.maxLat ||
            lng < VIETNAM_BOUNDS.minLng || lng > VIETNAM_BOUNDS.maxLng) {
            invalidCount++;
            console.log(`   ⚠️  Still invalid: ${poi.code} [${lat}, ${lng}]`);
        }
    }

    if (invalidCount === 0) {
        console.log('   ✅ All coordinates are valid');
    } else {
        console.log(`   ⚠️  ${invalidCount} POIs still have invalid coordinates`);
    }

    // Check for missing required fields
    const missingName = await Poi.countDocuments({ $or: [{ name: null }, { name: '' }] });
    const missingCode = await Poi.countDocuments({ $or: [{ code: null }, { code: '' }] });
    const missingRadius = await Poi.countDocuments({ $or: [{ radius: null }, { radius: { $exists: false } }] });

    console.log(`   Missing name: ${missingName}`);
    console.log(`   Missing code: ${missingCode}`);
    console.log(`   Missing radius: ${missingRadius}`);

    // Test geospatial query
    console.log('\n🧪 Testing geospatial query...');
    const testResult = await Poi.find({
        location: {
            $near: {
                $geometry: {
                    type: 'Point',
                    coordinates: [105.8542, 21.0285] // Hồ Hoàn Kiếm
                },
                $maxDistance: 1000
            }
        }
    }).limit(3);

    console.log(`   Found ${testResult.length} POIs near Hồ Hoàn Kiếm (within 1km)`);
    testResult.forEach((poi, i) => {
        console.log(`   ${i + 1}. ${poi.code} - ${poi.name}`);
    });

    if (testResult.length > 0) {
        console.log('   ✅ Geospatial queries working correctly');
    } else {
        console.log('   ⚠️  Geospatial query returned no results');
    }
}

/**
 * Main migration
 */
async function main() {
    console.log('\n========================================');
    console.log('POI MIGRATION FIX');
    console.log('========================================\n');

    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        throw new Error('MONGO_URI environment variable is required');
    }

    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected\n');

    try {
        // Run all fixes
        await fixOutOfBounds();
        await fixRadius();
        await fixMissingFields();
        await cleanLegacyContent();
        await resolveDuplicates();
        await ensureIndexes();
        await validateFinalState();

        // Print summary
        console.log('\n========================================');
        console.log('MIGRATION SUMMARY');
        console.log('========================================\n');
        console.log(`   Total processed: ${stats.processed}`);
        console.log(`   Total fixed: ${stats.fixed}`);
        console.log(`   Total deleted: ${stats.deleted}`);
        console.log(`   Total merged: ${stats.merged}`);
        console.log(`   Errors: ${stats.errors.length}\n`);

        if (stats.errors.length > 0) {
            console.log('⚠️  ERRORS:\n');
            stats.errors.forEach((err, i) => {
                console.log(`   ${i + 1}. ${err.step}: ${err.error}`);
            });
            console.log('');
        }

        console.log('✅ Migration complete!\n');

    } catch (error) {
        console.error('❌ MIGRATION FAILED:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('📡 Disconnected from MongoDB\n');
    }
}

// Run
main();
