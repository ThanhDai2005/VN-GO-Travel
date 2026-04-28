const mongoose = require('mongoose');
require('dotenv').config();

async function verifyDataConsistency() {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        const User = require('./src/models/user.model');
        const UserWallet = require('./src/models/user-wallet.model');
        const UserUnlockZone = require('./src/models/user-unlock-zone.model');
        const CreditTransaction = require('./src/models/credit-transaction.model');

        const user = await User.findOne({ email: 'test@vngo.com' });
        if (!user) {
            console.log('FAIL: User not found');
            process.exit(1);
        }

        const wallet = await UserWallet.findOne({ userId: user._id });
        const unlocks = await UserUnlockZone.find({ userId: user._id });
        const transactions = await CreditTransaction.find({ userId: user._id }).sort({ createdAt: 1 });

        console.log('=== DATA CONSISTENCY CHECK ===');
        console.log('Wallet balance:', wallet?.balance);
        console.log('Unlocked zones:', unlocks.map(u => u.zoneCode));
        console.log('Transactions:', transactions.length);

        // Verify consistency
        let totalSpent = 0;
        transactions.forEach(t => {
            if (t.amount < 0) totalSpent += Math.abs(t.amount);
        });

        const expectedBalance = 2000 - totalSpent;
        const actualBalance = wallet?.balance;

        console.log('\n=== VERIFICATION ===');
        console.log('Expected balance:', expectedBalance);
        console.log('Actual balance:', actualBalance);
        console.log('Total spent:', totalSpent);
        console.log('Unlocked zones count:', unlocks.length);
        console.log('Transaction records:', transactions.length);

        // Check consistency
        const balanceMatch = expectedBalance === actualBalance;
        const unlocksExist = unlocks.length > 0;
        const transactionsExist = transactions.length > 0;

        console.log('\n=== RESULT ===');
        console.log('Balance matches:', balanceMatch ? 'YES' : 'NO');
        console.log('Unlocks recorded:', unlocksExist ? 'YES' : 'NO');
        console.log('Transactions recorded:', transactionsExist ? 'YES' : 'NO');

        if (balanceMatch && unlocksExist && transactionsExist) {
            console.log('\n✔ PASS: Data consistent');
        } else {
            console.log('\n❌ FAIL: Data mismatch');
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('ERROR:', error.message);
        process.exit(1);
    }
}

verifyDataConsistency();
