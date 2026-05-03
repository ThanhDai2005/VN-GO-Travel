const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function checkPrices() {
    console.log('--- CHECKING ZONE PRICES ---');
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const Zone = require('../src/models/zone.model');
        const UserWallet = require('../src/models/user-wallet.model');
        const User = require('../src/models/user.model');

        const zones = await Zone.find({});
        for (const zone of zones) {
            console.log(`Zone: ${zone.name} (${zone.code}) - Price: ${zone.price}`);
        }

        const admin = await User.findOne({ email: 'admin@vngo.com' });
        if (admin) {
            const wallet = await UserWallet.findOne({ userId: admin._id });
            console.log(`\nAdmin Wallet Balance: ${wallet ? wallet.balance : 'N/A'}`);
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

checkPrices();
