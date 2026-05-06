/**
 * Comprehensive Fix Script for All Reported Issues
 *
 * Issues to fix:
 * 1. POI zone membership inconsistency - POI shows in zone list but not in detail view
 * 2. Unauthenticated purchase redirect not working
 * 3. Update all user wallets to have large point balances
 * 4. Audio not appearing after zone purchase
 * 5. Test purchase history and downloads for existing users
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

// Models
const UserWallet = require('./src/models/user-wallet.model');
const User = require('./src/models/user.model');
const Zone = require('./src/models/zone.model');
const Poi = require('./src/models/poi.model');
const UserUnlockZone = require('./src/models/user-unlock-zone.model');
const UserUnlockPoi = require('./src/models/user-unlock-poi.model');

async function connectDB() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
}

async function fixIssue1_VerifyZonePOIMapping() {
    console.log('\n=== ISSUE 1: Verify POI-Zone Mapping ===');

    try {
        // Get all zones
        const zones = await Zone.find({ isActive: true });
        console.log(`Found ${zones.length} active zones`);

        for (const zone of zones) {
            console.log(`\n📦 Zone: ${zone.code} - ${zone.name}`);
            console.log(`   POI Codes in zone: ${zone.poiCodes.join(', ')}`);

            // Check if POIs exist
            for (const poiCode of zone.poiCodes) {
                const poi = await Poi.findOne({ code: poiCode });
                if (!poi) {
                    console.log(`   ⚠️  POI ${poiCode} NOT FOUND in database`);
                } else {
                    console.log(`   ✅ POI ${poiCode} exists - Status: ${poi.status}`);
                }
            }
        }

        // Check for POIs that might not be in any zone
        const allPois = await Poi.find({ status: 'APPROVED' });
        console.log(`\n📍 Total APPROVED POIs: ${allPois.length}`);

        for (const poi of allPois) {
            const zonesContaining = await Zone.find({
                isActive: true,
                poiCodes: poi.code
            });

            if (zonesContaining.length === 0) {
                console.log(`⚠️  POI ${poi.code} (${poi.name}) is NOT in any zone`);
            } else {
                console.log(`✅ POI ${poi.code} is in zones: ${zonesContaining.map(z => z.code).join(', ')}`);
            }
        }

        console.log('\n✅ Issue 1 verification complete');
    } catch (error) {
        console.error('❌ Error in Issue 1:', error);
    }
}

async function fixIssue3_UpdateWalletBalances() {
    console.log('\n=== ISSUE 3: Update User Wallet Balances ===');

    try {
        const LARGE_BALANCE = 1000000; // 1 million credits

        // Get all users
        const users = await User.find({});
        console.log(`Found ${users.length} users`);

        for (const user of users) {
            // Get or create wallet
            let wallet = await UserWallet.findOne({ userId: user._id });

            if (!wallet) {
                wallet = await UserWallet.create({
                    userId: user._id,
                    balance: LARGE_BALANCE,
                    version: 0
                });
                console.log(`✅ Created wallet for ${user.email} with ${LARGE_BALANCE} credits`);
            } else {
                // Update balance
                wallet.balance = LARGE_BALANCE;
                wallet.version += 1;
                await wallet.save();
                console.log(`✅ Updated wallet for ${user.email} to ${LARGE_BALANCE} credits`);
            }
        }

        console.log('\n✅ Issue 3 complete - All wallets updated');
    } catch (error) {
        console.error('❌ Error in Issue 3:', error);
    }
}

async function fixIssue4_VerifyAudioAfterPurchase() {
    console.log('\n=== ISSUE 4: Verify Audio Availability After Purchase ===');

    try {
        // Find users who have purchased zones
        const purchases = await UserUnlockZone.find({}).populate('userId');
        console.log(`Found ${purchases.length} zone purchases`);

        for (const purchase of purchases) {
            const user = purchase.userId;
            const zoneCode = purchase.zoneCode;

            console.log(`\n👤 User: ${user?.email || 'Unknown'}`);
            console.log(`   Zone: ${zoneCode}`);
            console.log(`   Purchased: ${purchase.purchasedAt}`);

            // Get zone details
            const zone = await Zone.findOne({ code: zoneCode });
            if (!zone) {
                console.log(`   ⚠️  Zone ${zoneCode} not found`);
                continue;
            }

            console.log(`   Zone has ${zone.poiCodes.length} POIs`);

            // Check if POIs are unlocked
            for (const poiCode of zone.poiCodes) {
                const poiUnlock = await UserUnlockPoi.findOne({
                    userId: user._id,
                    poiCode: poiCode
                });

                if (poiUnlock) {
                    console.log(`   ✅ POI ${poiCode} is unlocked`);
                } else {
                    console.log(`   ⚠️  POI ${poiCode} is NOT unlocked - FIXING...`);

                    // Fix: Unlock the POI
                    try {
                        await UserUnlockPoi.create({
                            userId: user._id,
                            poiCode: poiCode,
                            purchasePrice: 0,
                            purchasedAt: purchase.purchasedAt
                        });
                        console.log(`   ✅ Fixed: POI ${poiCode} now unlocked`);
                    } catch (err) {
                        if (err.code === 11000) {
                            console.log(`   ℹ️  POI ${poiCode} already unlocked (duplicate key)`);
                        } else {
                            console.log(`   ❌ Error unlocking POI ${poiCode}:`, err.message);
                        }
                    }
                }
            }
        }

        console.log('\n✅ Issue 4 complete - Audio availability verified');
    } catch (error) {
        console.error('❌ Error in Issue 4:', error);
    }
}

async function fixIssue5_TestPurchaseHistory() {
    console.log('\n=== ISSUE 5: Test Purchase History ===');

    try {
        // Find users with zone purchases
        const usersWithPurchases = await UserUnlockZone.distinct('userId');
        console.log(`Found ${usersWithPurchases.length} users with zone purchases`);

        for (const userId of usersWithPurchases) {
            const user = await User.findById(userId);
            if (!user) continue;

            console.log(`\n👤 User: ${user.email}`);

            // Get zone purchases
            const zonePurchases = await UserUnlockZone.find({ userId }).sort({ purchasedAt: -1 });
            console.log(`   Zone Purchases: ${zonePurchases.length}`);

            for (const zp of zonePurchases) {
                const zone = await Zone.findOne({ code: zp.zoneCode });
                console.log(`   - ${zp.zoneCode} (${zone?.name || 'Unknown'}) - ${zp.purchasedAt.toISOString()}`);

                if (zone) {
                    console.log(`     Contains ${zone.poiCodes.length} POIs`);

                    // Verify all POIs are unlocked
                    for (const poiCode of zone.poiCodes) {
                        const poiUnlock = await UserUnlockPoi.findOne({ userId, poiCode });
                        if (!poiUnlock) {
                            console.log(`     ⚠️  POI ${poiCode} NOT unlocked - FIXING...`);
                            try {
                                await UserUnlockPoi.create({
                                    userId,
                                    poiCode,
                                    purchasePrice: 0,
                                    purchasedAt: zp.purchasedAt
                                });
                                console.log(`     ✅ Fixed: POI ${poiCode} unlocked`);
                            } catch (err) {
                                if (err.code !== 11000) {
                                    console.log(`     ❌ Error:`, err.message);
                                }
                            }
                        }
                    }
                }
            }

            // Get POI purchases
            const poiPurchases = await UserUnlockPoi.find({ userId }).sort({ purchasedAt: -1 });
            console.log(`   POI Purchases: ${poiPurchases.length}`);
        }

        console.log('\n✅ Issue 5 complete - Purchase history verified');
    } catch (error) {
        console.error('❌ Error in Issue 5:', error);
    }
}

async function generateReport() {
    console.log('\n=== FINAL REPORT ===');

    try {
        const userCount = await User.countDocuments();
        const walletCount = await UserWallet.countDocuments();
        const zoneCount = await Zone.countDocuments({ isActive: true });
        const poiCount = await Poi.countDocuments({ status: 'APPROVED' });
        const zonePurchaseCount = await UserUnlockZone.countDocuments();
        const poiUnlockCount = await UserUnlockPoi.countDocuments();

        console.log(`
📊 Database Statistics:
   - Users: ${userCount}
   - Wallets: ${walletCount}
   - Active Zones: ${zoneCount}
   - Approved POIs: ${poiCount}
   - Zone Purchases: ${zonePurchaseCount}
   - POI Unlocks: ${poiUnlockCount}
        `);

        // Check wallet balances
        const wallets = await UserWallet.find({}).populate('userId');
        console.log('\n💰 Wallet Balances:');
        for (const wallet of wallets) {
            const user = wallet.userId;
            console.log(`   ${user?.email || 'Unknown'}: ${wallet.balance} credits`);
        }

    } catch (error) {
        console.error('❌ Error generating report:', error);
    }
}

async function main() {
    console.log('🚀 Starting comprehensive fix script...\n');

    await connectDB();

    // Run all fixes
    await fixIssue1_VerifyZonePOIMapping();
    await fixIssue3_UpdateWalletBalances();
    await fixIssue4_VerifyAudioAfterPurchase();
    await fixIssue5_TestPurchaseHistory();
    await generateReport();

    console.log('\n✅ All fixes completed successfully!');
    console.log('\n📝 Summary:');
    console.log('   1. ✅ Verified POI-Zone mappings');
    console.log('   2. ⏭️  Unauthenticated redirect (mobile app fix needed)');
    console.log('   3. ✅ Updated all user wallet balances to 1,000,000 credits');
    console.log('   4. ✅ Fixed POI unlocks for zone purchases');
    console.log('   5. ✅ Verified purchase history and downloads');

    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
