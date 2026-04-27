require('dotenv').config();
const mongoose = require('mongoose');

const User = require('./src/models/user.model');
const UserWallet = require('./src/models/user-wallet.model');
const CreditTransaction = require('./src/models/credit-transaction.model');
const UserUnlockZone = require('./src/models/user-unlock-zone.model');
const EventModel = require('./src/models/event.model');

async function main() {
    await mongoose.connect(process.env.MONGO_URI);

    const demoUser = await User.findOne({ email: 'demo@vngo.com' });
    if (!demoUser) {
        console.log("No demo user found!");
        process.exit(1);
    }

    const userId = demoUser._id;

    console.log("--- 1. Wallet consistency ---");
    const wallet = await UserWallet.findOne({ userId });
    console.log(`Wallet Balance: ${wallet?.balance}`);
    
    const txs = await CreditTransaction.find({ userId }).sort({ createdAt: 1 });
    let calculatedBalance = 0;
    txs.forEach(tx => {
        calculatedBalance += tx.amount;
        console.log(`Tx: ${tx.type}, amount: ${tx.amount}`);
    });
    console.log(`Calculated Balance: ${calculatedBalance}`);
    console.log(`Is Consistent: ${wallet?.balance === calculatedBalance}`);

    console.log("--- 2. Zone unlock ---");
    const unlocks = await UserUnlockZone.find({ userId });
    console.log(`Unlocked zones: ${unlocks.map(u => u.zoneCode).join(', ')}`);
    const hasHcmc = unlocks.some(u => u.zoneCode === 'DEMO_HCMC_DISTRICT1');
    console.log(`Has DEMO_HCMC_DISTRICT1: ${hasHcmc}`);

    console.log("--- 3. Event existence ---");
    // event.model.js might export something
    let globalEventCount = 0;
    let userEventCount = 0;
    try {
        globalEventCount = await EventModel.countDocuments();
        userEventCount = await EventModel.countDocuments({ userId });
        console.log(`User Events: ${userEventCount}`);
        console.log(`Global Events: ${globalEventCount}`);
    } catch(e) {
        console.log("Event model issue:", e.message);
        // Fallback to direct collection query
        const db = mongoose.connection.db;
        const eventsColl = db.collection('events');
        globalEventCount = await eventsColl.countDocuments();
        userEventCount = await eventsColl.countDocuments({ userId });
        console.log(`User Events (raw): ${userEventCount}`);
        console.log(`Global Events (raw): ${globalEventCount}`);
    }

    process.exit(0);
}
main().catch(console.error);
