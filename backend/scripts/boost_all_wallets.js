/**
 * ONE-TIME SCRIPT: Boost All User Credits
 * Sets balance to 1,000,000,000 for every user in the system.
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

async function boostAllCredits() {
    try {
        console.log('🚀 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected.\n');

        const db = mongoose.connection.db;

        console.log('📊 Current state of userwallets:');
        const count = await db.collection('userwallets').countDocuments();
        console.log(`Found ${count} wallets.`);

        console.log('\n💎 Boosting all wallets to 1,000,000,000 credits...');
        const result = await db.collection('userwallets').updateMany(
            {},
            { 
                $set: { 
                    balance: 1000000000, 
                    updatedAt: new Date() 
                } 
            }
        );

        console.log(`✅ Success! Updated ${result.modifiedCount} wallets.`);

        // Also check if any users are missing wallets
        console.log('\n🔍 Checking for users without wallets...');
        const users = await db.collection('users').find({}).toArray();
        let createdCount = 0;

        for (const user of users) {
            const wallet = await db.collection('userwallets').findOne({ userId: user._id });
            if (!wallet) {
                await db.collection('userwallets').insertOne({
                    userId: user._id,
                    balance: 1000000000,
                    currency: 'credits',
                    lastTransaction: null,
                    version: 0,
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
                createdCount++;
            }
        }

        if (createdCount > 0) {
            console.log(`✅ Created ${createdCount} missing wallets with high credits.`);
        } else {
            console.log('✅ All users already have wallets.');
        }

        await mongoose.disconnect();
        console.log('\n👋 Done!');

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

boostAllCredits();
