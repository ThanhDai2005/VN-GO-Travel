const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function simulatePurchase() {
    console.log('--- SIMULATING PURCHASE FLOW ---');
    try {
        await mongoose.connect(process.env.MONGO_URI);
        
        const User = require('../src/models/user.model');
        const Zone = require('../src/models/zone.model');
        const purchaseService = require('../src/services/purchase.service');
        const walletRepository = require('../src/repositories/user-wallet.repository');

        // 1. Find or create a test user
        let user = await User.findOne({ email: 'test_purchaser@vngo.com' });
        if (!user) {
            user = await User.create({
                email: 'test_purchaser@vngo.com',
                password: 'password123',
                fullName: 'Test Purchaser'
            });
        }

        // 2. Check wallet
        let wallet = await walletRepository.getOrCreate(user._id);
        console.log(`Initial Balance: ${wallet.balance}`);

        // 3. Try to purchase HCMC D1 (Price: 100)
        const zoneCode = 'HO_CHI_MINH_CITY_DISTRICT_1';
        console.log(`Attempting to purchase zone: ${zoneCode}`);
        
        try {
            await purchaseService.purchaseZone(user._id, zoneCode);
            console.log('✅ Purchase SUCCESS (Unexpected if balance was 5)');
        } catch (err) {
            console.log(`❌ Purchase FAILED: ${err.message}`);
            if (err.message.includes('Insufficient credits')) {
                console.log('Confirmed: Root cause is insufficient credits.');
            }
        }

        // 4. Add credits and try again
        console.log('\nAdding 200 credits...');
        await walletRepository.addCredits(user._id, 200, 'Test grant');
        
        wallet = await walletRepository.getOrCreate(user._id);
        console.log(`New Balance: ${wallet.balance}`);

        console.log('Retrying purchase...');
        const result = await purchaseService.purchaseZone(user._id, zoneCode);
        console.log('✅ Purchase SUCCESS');
        console.log('Result:', JSON.stringify(result, null, 2));

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

simulatePurchase();
