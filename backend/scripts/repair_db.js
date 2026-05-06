const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const UserWallet = require('../src/models/user-wallet.model');
const Zone = require('../src/models/zone.model');
const ZonePoi = require('../src/models/zone-poi.model');

async function repair() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vngo');
        console.log('Connected.');

        // 1. Give everyone huge points
        console.log('Giving all users 1,000,000,000 credits...');
        const walletResult = await UserWallet.updateMany({}, { $set: { balance: 1000000000 } });
        console.log(`Updated ${walletResult.modifiedCount} wallets.`);

        // 2. Sync ZonePoi mappings to Zone.poiCodes
        console.log('Syncing ZonePoi mappings to Zone denormalized arrays...');
        const zones = await Zone.find({});
        for (const zone of zones) {
            const mappings = await ZonePoi.find({ zoneId: zone._id });
            const poiCodes = mappings.map(m => m.poiCode.toUpperCase());
            
            // Merge with existing but keep unique
            const currentCodes = zone.poiCodes || [];
            const mergedCodes = [...new Set([...currentCodes, ...poiCodes])];
            
            if (mergedCodes.length !== currentCodes.length) {
                zone.poiCodes = mergedCodes;
                await zone.save();
                console.log(`Updated zone ${zone.code} with ${mergedCodes.length} POIs.`);
            } else {
                console.log(`Zone ${zone.code} is already in sync (${mergedCodes.length} POIs).`);
            }
        }

        console.log('Repair complete.');
        process.exit(0);
    } catch (error) {
        console.error('Repair failed:', error);
        process.exit(1);
    }
}

repair();
