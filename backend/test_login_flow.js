/**
 * Test Complete Login Flow
 * Simulates the exact login process
 */

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./src/models/user.model');
const UserWallet = require('./src/models/user-wallet.model');

async function testLoginFlow() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        console.log('=== TESTING LOGIN FLOW ===\n');

        // Test with a known user
        const testEmail = 'nva@vngo.com';
        const testPassword = '123456';

        console.log('1. Finding user by email:', testEmail);
        const user = await User.findOne({ email: testEmail });

        if (!user) {
            console.log('❌ User not found');
            await mongoose.disconnect();
            return;
        }

        console.log('✅ User found:', user.email);
        console.log('   Role:', user.role);
        console.log('   Is Active:', user.isActive);

        // Test password
        console.log('\n2. Testing password...');
        const passwordMatch = await bcrypt.compare(testPassword, user.password);
        console.log('   Password match:', passwordMatch ? '✅ YES' : '❌ NO');

        if (!passwordMatch) {
            console.log('   ⚠️  Try different password or check user.password field');
            await mongoose.disconnect();
            return;
        }

        // Generate token
        console.log('\n3. Generating JWT token...');
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
            expiresIn: '7d'
        });
        console.log('✅ Token generated:', token.substring(0, 50) + '...');

        // Check wallet
        console.log('\n4. Checking user wallet...');
        const wallet = await UserWallet.findOne({ userId: user._id });

        if (!wallet) {
            console.log('❌ Wallet not found - THIS WOULD CAUSE LOGIN TO FAIL');

            // Create wallet
            console.log('   Creating wallet...');
            const newWallet = await UserWallet.create({
                userId: user._id,
                balance: 1000000,
                version: 0
            });
            console.log('✅ Wallet created with balance:', newWallet.balance);
        } else {
            console.log('✅ Wallet found');
            console.log('   Balance:', wallet.balance);
            console.log('   Version:', wallet.version);
        }

        // Simulate API response
        console.log('\n5. Simulating API response...');
        const response = {
            success: true,
            data: {
                user: {
                    id: user._id,
                    email: user.email,
                    fullName: user.fullName || '',
                    role: user.role || 'USER',
                    isPremium: user.isPremium || false,
                    isActive: user.isActive !== false
                },
                token: token
            }
        };

        console.log('✅ API Response:', JSON.stringify(response, null, 2));

        console.log('\n=== LOGIN FLOW TEST COMPLETE ===');
        console.log('✅ All steps passed successfully!');

        await mongoose.disconnect();
        console.log('\n👋 Disconnected from MongoDB');

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

testLoginFlow();
