const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function verifyBalance() {
    console.log('--- VERIFYING NEW USER BALANCE ---');
    try {
        await mongoose.connect(process.env.MONGO_URI);
        
        const User = require('../src/models/user.model');
        const walletRepo = require('../src/repositories/user-wallet.repository');

        const email = `new_user_${Date.now()}@vngo.com`;
        const user = await User.create({
            email,
            password: 'password123',
            fullName: 'New User'
        });

        const wallet = await walletRepo.getOrCreate(user._id);
        console.log(`NEW USER BALANCE: ${wallet.balance}`);
        
        if (wallet.balance === 100) {
            console.log('✅ PASS: Initial balance is 100');
        } else {
            console.log(`❌ FAIL: Initial balance is ${wallet.balance}`);
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

verifyBalance();
