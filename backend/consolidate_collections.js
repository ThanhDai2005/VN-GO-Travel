/**
 * CRITICAL FIX: Consolidate Duplicate Collections
 *
 * Problem: Multiple collections with different naming:
 * - user_unlock_zones (0) vs userunlockzones (18)
 * - user_unlock_pois (0) vs userunlockpois (31)
 *
 * Mobile app is querying empty collections!
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function consolidateCollections() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        const db = mongoose.connection.db;

        console.log('=== CONSOLIDATING DUPLICATE COLLECTIONS ===\n');

        // 1. Drop empty collections
        console.log('Step 1: Dropping empty collections...');

        try {
            await db.collection('user_unlock_zones').drop();
            console.log('✅ Dropped user_unlock_zones (was empty)');
        } catch (err) {
            console.log('  user_unlock_zones already dropped or does not exist');
        }

        try {
            await db.collection('user_unlock_pois').drop();
            console.log('✅ Dropped user_unlock_pois (was empty)');
        } catch (err) {
            console.log('  user_unlock_pois already dropped or does not exist');
        }

        try {
            await db.collection('zone_pois').drop();
            console.log('✅ Dropped zone_pois (was empty)');
        } catch (err) {
            console.log('  zone_pois already dropped or does not exist');
        }

        try {
            await db.collection('audio_sessions').drop();
            console.log('✅ Dropped audio_sessions (duplicate)');
        } catch (err) {
            console.log('  audio_sessions already dropped or does not exist');
        }

        // 2. Verify data is in correct collections
        console.log('\n=== VERIFYING DATA ===\n');

        const zoneUnlocks = await db.collection('userunlockzones').countDocuments();
        const poiUnlocks = await db.collection('userunlockpois').countDocuments();

        console.log('userunlockzones:', zoneUnlocks, 'documents ✅');
        console.log('userunlockpois:', poiUnlocks, 'documents ✅');

        // 3. Check specific user
        console.log('\n=== CHECKING USER nva@vngo.com ===\n');

        const user = await db.collection('users').findOne({ email: 'nva@vngo.com' });
        if (user) {
            const userZones = await db.collection('userunlockzones').find({ userId: user._id }).toArray();
            const userPois = await db.collection('userunlockpois').find({ userId: user._id }).toArray();

            console.log('Zone purchases:', userZones.length);
            userZones.forEach(z => {
                console.log('  -', z.zoneCode, 'purchased at', z.purchasedAt);
            });

            console.log('\nPOI unlocks:', userPois.length);
            userPois.slice(0, 5).forEach(p => {
                console.log('  -', p.poiCode);
            });
        }

        // 4. List all remaining collections
        console.log('\n=== FINAL COLLECTION LIST ===\n');
        const collections = await db.listCollections().toArray();
        const relevantCollections = collections.filter(c =>
            c.name.includes('unlock') || c.name.includes('zone') || c.name.includes('poi')
        );

        relevantCollections.forEach(c => {
            console.log(' ', c.name);
        });

        console.log('\n✅ Collection consolidation complete!');

        await mongoose.disconnect();
        console.log('\n👋 Disconnected from MongoDB');

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

consolidateCollections();
