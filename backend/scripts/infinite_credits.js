const mongoose = require('mongoose');
require('dotenv').config();

async function giveInfiniteCredits() {
    try {
        console.log('--- Infinite Credits Migration Start ---');
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/vngo');
        console.log('Connected to MongoDB');

        const UserWallet = require('../src/models/user-wallet.model');

        // Update all wallets to have 1,000,000 balance
        const result = await UserWallet.updateMany(
            {},
            { 
                $set: { balance: 1000000 },
                $inc: { version: 1 } 
            }
        );

        console.log(`Successfully updated ${result.modifiedCount} wallets.`);
        console.log('--- Migration Complete ---');

        await mongoose.disconnect();
    } catch (error) {
        console.error('Migration failed:', error.message);
        process.exit(1);
    }
}

giveInfiniteCredits();
