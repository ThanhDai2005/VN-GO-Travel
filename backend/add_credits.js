const mongoose = require('mongoose');
require('dotenv').config();

async function addCredits() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const UserWallet = require('./src/models/user-wallet.model');
        const userId = '69edfc719e1c528b098da9ff';

        const result = await UserWallet.findOneAndUpdate(
            { userId },
            { $inc: { balance: 1000 } },
            { upsert: true, new: true }
        );

        console.log('Credits added successfully');
        console.log('New balance:', result.balance);

        await mongoose.disconnect();
        console.log('Disconnected');
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

addCredits();
