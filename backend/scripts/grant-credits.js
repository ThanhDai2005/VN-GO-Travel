require('dotenv').config();
const mongoose = require('mongoose');
const UserWallet = require('../src/models/user-wallet.model');
const CreditTransaction = require('../src/models/credit-transaction.model');
const config = require('../src/config');

async function grantCredits() {
    try {
        await mongoose.connect(config.mongoUri);
        console.log('MongoDB connected');

        const userId = '69ead834719b951300d9cad1';
        const amount = 1000;

        // Get or create wallet
        let wallet = await UserWallet.findOne({ userId });
        if (!wallet) {
            wallet = await UserWallet.create({
                userId,
                balance: 0,
                currency: 'credits'
            });
        }

        const balanceBefore = wallet.balance;
        const balanceAfter = balanceBefore + amount;

        // Update wallet
        wallet.balance = balanceAfter;
        wallet.version += 1;
        await wallet.save();

        // Record transaction
        await CreditTransaction.create({
            userId,
            type: 'admin_grant',
            amount: amount,
            balanceBefore,
            balanceAfter,
            relatedEntity: null,
            metadata: {
                reason: 'Test credits for zone purchase',
                grantedBy: 'script'
            }
        });

        console.log(`✅ Granted ${amount} credits to user ${userId}`);
        console.log(`Balance: ${balanceBefore} → ${balanceAfter}`);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

grantCredits();
