/**
 * CRITICAL FIX: Wallet Collection Naming Issue
 *
 * Problem: There are two collections:
 * - userwallets (23 documents) - OLD
 * - user_wallets (1 document) - NEW
 *
 * The model is creating new collection but data is in old one.
 * This script consolidates everything into userwallets.
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

async function fixWalletCollections() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        const db = mongoose.connection.db;

        // Check current state
        const userWalletsCount = await db.collection('user_wallets').countDocuments();
        const userwalletsCount = await db.collection('userwallets').countDocuments();

        console.log('=== CURRENT STATE ===');
        console.log('user_wallets collection:', userWalletsCount, 'documents');
        console.log('userwallets collection:', userwalletsCount, 'documents');

        // Get all documents from user_wallets
        const newWallets = await db.collection('user_wallets').find({}).toArray();

        if (newWallets.length > 0) {
            console.log('\n=== MIGRATING DATA ===');
            console.log('Moving', newWallets.length, 'documents from user_wallets to userwallets...');

            for (const wallet of newWallets) {
                // Check if already exists in userwallets
                const existing = await db.collection('userwallets').findOne({ userId: wallet.userId });

                if (existing) {
                    console.log('  Wallet for user', wallet.userId, 'already exists in userwallets - skipping');
                } else {
                    // Insert into userwallets
                    await db.collection('userwallets').insertOne(wallet);
                    console.log('  ✅ Migrated wallet for user', wallet.userId);
                }
            }

            // Drop user_wallets collection
            console.log('\n=== CLEANING UP ===');
            await db.collection('user_wallets').drop();
            console.log('✅ Dropped user_wallets collection');
        }

        // Verify final state
        const finalCount = await db.collection('userwallets').countDocuments();
        console.log('\n=== FINAL STATE ===');
        console.log('userwallets collection:', finalCount, 'documents');

        // Verify all users have wallets
        console.log('\n=== VERIFYING USER WALLETS ===');
        const users = await db.collection('users').find({}).toArray();
        console.log('Total users:', users.length);

        let missingWallets = 0;
        for (const user of users) {
            const wallet = await db.collection('userwallets').findOne({ userId: user._id });
            if (!wallet) {
                console.log('  ⚠️  Missing wallet for:', user.email);
                missingWallets++;

                // Create wallet
                await db.collection('userwallets').insertOne({
                    userId: user._id,
                    balance: 1000000000,
                    currency: 'credits',
                    lastTransaction: null,
                    version: 0,
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
                console.log('  ✅ Created wallet for:', user.email);
            } else {
                console.log('  ✅', user.email, '- balance:', wallet.balance);
            }
        }

        if (missingWallets === 0) {
            console.log('\n✅ All users have wallets!');
        } else {
            console.log('\n✅ Created', missingWallets, 'missing wallets');
        }

        await mongoose.disconnect();
        console.log('\n👋 Fix complete!');

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

fixWalletCollections();
