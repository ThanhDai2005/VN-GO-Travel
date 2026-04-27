const BASE_URL = 'http://localhost:3000/api/v1';

async function req(method, path, body = null, token = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE_URL}${path}`, opts);
    let data;
    try { data = await res.json(); } catch (e) { data = { error: e.message }; }
    return { status: res.status, data };
}

async function testMultiPurchase() {
    console.log('=== SCENARIO 5: MULTI-PURCHASE CONSISTENCY ===\n');

    const mongoose = require('mongoose');
    require('dotenv').config();

    // Create fresh test user
    await mongoose.connect(process.env.MONGO_URI);
    const User = require('./src/models/user.model');
    const UserWallet = require('./src/models/user-wallet.model');
    const UserUnlockZone = require('./src/models/user-unlock-zone.model');
    const CreditTransaction = require('./src/models/credit-transaction.model');

    const oldUser = await User.findOne({ email: 'multitest@vngo.com' });
    if (oldUser) {
        await UserWallet.deleteMany({ userId: oldUser._id });
        await UserUnlockZone.deleteMany({ userId: oldUser._id });
        await CreditTransaction.deleteMany({ userId: oldUser._id });
        await User.deleteOne({ _id: oldUser._id });
    }

    const user = await User.create({
        email: 'multitest@vngo.com',
        password: 'test123',
        fullName: 'Multi Test',
        role: 'USER',
        isPremium: false,
        isActive: true
    });

    await UserWallet.create({
        userId: user._id,
        balance: 5000,
        version: 0
    });

    console.log('Created test user with 5000 credits\n');
    await mongoose.disconnect();

    // Login
    const loginRes = await req('POST', '/auth/login', { email: 'multitest@vngo.com', password: 'test123' });
    const token = loginRes.data?.data?.token || loginRes.data?.token;

    // Get zones
    const zonesRes = await req('GET', '/zones', null, token);
    const zones = zonesRes.data?.data || [];
    console.log('Available zones:', zones.map(z => z.code));

    // Purchase zone A
    console.log('\nPurchasing zone A...');
    const purchase1 = await req('POST', '/purchase/zone', { zoneCode: zones[0].code }, token);
    console.log('Zone A result:', purchase1.status, purchase1.data?.success ? 'SUCCESS' : 'FAILED');

    // Wait to avoid rate limit
    await new Promise(resolve => setTimeout(resolve, 21000));

    // Purchase zone B
    console.log('\nPurchasing zone B...');
    const purchase2 = await req('POST', '/purchase/zone', { zoneCode: zones[1].code }, token);
    console.log('Zone B result:', purchase2.status, purchase2.data?.success ? 'SUCCESS' : 'FAILED');

    // Wait to avoid rate limit
    await new Promise(resolve => setTimeout(resolve, 21000));

    // Verify database
    await mongoose.connect(process.env.MONGO_URI);
    const wallet = await UserWallet.findOne({ userId: user._id });
    const unlocks = await UserUnlockZone.find({ userId: user._id });
    const transactions = await CreditTransaction.find({ userId: user._id });

    console.log('\n=== VERIFICATION ===');
    console.log('Initial balance: 5000');
    console.log('Final balance:', wallet?.balance);
    console.log('Expected balance:', 5000 - 500 - 500, '(5000 - 500 - 500)');
    console.log('Unlocked zones:', unlocks.map(u => u.zoneCode));
    console.log('Transaction count:', transactions.length);

    const balanceCorrect = wallet?.balance === 4000;
    const unlocksCorrect = unlocks.length === 2;
    const transactionsCorrect = transactions.length === 2;

    console.log('\nBalance correct:', balanceCorrect ? 'YES' : 'NO');
    console.log('Unlocks correct:', unlocksCorrect ? 'YES' : 'NO');
    console.log('Transactions correct:', transactionsCorrect ? 'YES' : 'NO');

    if (balanceCorrect && unlocksCorrect && transactionsCorrect) {
        console.log('\n✔ PASS: Multi-purchase consistent');
    } else {
        console.log('\n❌ FAIL: Multi-purchase mismatch');
    }

    await mongoose.disconnect();
}

testMultiPurchase().catch(err => {
    console.error('ERROR:', err.message);
    process.exit(1);
});
