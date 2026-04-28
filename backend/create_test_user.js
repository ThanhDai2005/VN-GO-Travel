const mongoose = require('mongoose');
require('dotenv').config();

async function createTestUser() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const User = require('./src/models/user.model');
        const UserWallet = require('./src/models/user-wallet.model');
        const UserUnlockZone = require('./src/models/user-unlock-zone.model');
        const UserUnlockPoi = require('./src/models/user-unlock-poi.model');
        const CreditTransaction = require('./src/models/credit-transaction.model');

        // Delete existing test user and all related data
        const oldUser = await User.findOne({ email: 'test@vngo.com' });
        if (oldUser) {
            await UserWallet.deleteMany({ userId: oldUser._id });
            await UserUnlockZone.deleteMany({ userId: oldUser._id });
            await UserUnlockPoi.deleteMany({ userId: oldUser._id });
            await CreditTransaction.deleteMany({ userId: oldUser._id });
            await User.deleteOne({ _id: oldUser._id });
            console.log('Deleted old test user and all related data');
        }

        // Create new test user
        const user = await User.create({
            email: 'test@vngo.com',
            password: 'password123',
            fullName: 'Test User',
            role: 'USER',
            isPremium: false,
            isActive: true
        });

        console.log('Created new test user:', user._id);

        // Create wallet with credits
        await UserWallet.create({
            userId: user._id,
            balance: 2000,
            version: 0
        });

        console.log('Created wallet with 2000 credits');

        await mongoose.disconnect();
        console.log('Done');
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

createTestUser();
