/**
 * PHASE 3: BUILD INDEXES
 *
 * Creates required indexes for Phase 3 collections
 * - uis_identity_edges indexes per v7.3.2 §6
 *
 * Run: node scripts/phase3-build-indexes.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const IntelligenceIdentityEdge = require('../src/models/intelligence-identity-edge.model');

async function buildIndexes() {
    console.log('\n========================================');
    console.log('PHASE 3: BUILD INDEXES');
    console.log('========================================\n');

    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGO_URI;
        if (!mongoUri) {
            throw new Error('MONGO_URI environment variable is required');
        }

        console.log('📡 Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✅ Connected\n');

        console.log('Building indexes for uis_identity_edges...\n');

        // Drop existing indexes (except _id)
        try {
            const existingIndexes = await IntelligenceIdentityEdge.collection.getIndexes();
            for (const indexName of Object.keys(existingIndexes)) {
                if (indexName !== '_id_') {
                    await IntelligenceIdentityEdge.collection.dropIndex(indexName);
                    console.log(`   🗑️  Dropped index: ${indexName}`);
                }
            }
        } catch (error) {
            console.log('   ⚠️  No existing indexes to drop');
        }

        // Build indexes using Mongoose schema
        await IntelligenceIdentityEdge.createIndexes();
        console.log('\n   ✅ Indexes created via Mongoose schema\n');

        // Verify indexes
        const indexes = await IntelligenceIdentityEdge.collection.getIndexes();
        console.log('📊 Current indexes:\n');

        for (const [indexName, indexSpec] of Object.entries(indexes)) {
            console.log(`   ✅ ${indexName}`);
            console.log(`      Keys: ${JSON.stringify(indexSpec.key)}`);
            if (indexSpec.unique) {
                console.log(`      Unique: true`);
            }
            if (indexSpec.partialFilterExpression) {
                console.log(`      Partial: ${JSON.stringify(indexSpec.partialFilterExpression)}`);
            }
        }

        console.log('\n========================================');
        console.log('✅ INDEX BUILD COMPLETE');
        console.log('========================================\n');

    } catch (error) {
        console.error('\n❌ INDEX BUILD FAILED:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('📡 Disconnected from MongoDB\n');
    }
}

// Run index build
buildIndexes().then(() => {
    process.exit(0);
});
