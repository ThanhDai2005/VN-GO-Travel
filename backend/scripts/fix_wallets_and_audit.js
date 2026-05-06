const mongoose = require('mongoose');
const dns = require('dns');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const User = require('../src/models/user.model');
const UserWallet = require('../src/models/user-wallet.model');
const CreditTransaction = require('../src/models/credit-transaction.model');
const Zone = require('../src/models/zone.model');
const Poi = require('../src/models/poi.model');

const HUGE_BALANCE = 999999999;

async function run() {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  if (!process.env.MONGO_URI) {
    throw new Error('Missing MONGO_URI');
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('[FIX] Connected MongoDB');

  const users = await User.find({}, { _id: 1, email: 1 }).lean();
  console.log(`[FIX] Users found: ${users.length}`);

  let createdWallets = 0;
  let toppedUp = 0;
  for (const u of users) {
    const existing = await UserWallet.findOne({ userId: u._id });
    if (!existing) {
      await UserWallet.create({
        userId: u._id,
        balance: HUGE_BALANCE,
        version: 0,
        currency: 'credits',
        lastTransaction: new Date()
      });
      createdWallets++;
      await CreditTransaction.record({
        userId: u._id,
        type: 'initial_bonus',
        amount: HUGE_BALANCE,
        balanceBefore: 0,
        balanceAfter: HUGE_BALANCE,
        relatedEntity: null,
        metadata: { source: 'maintenance_script', reason: 'initialize huge test balance' }
      });
      continue;
    }

    if (existing.balance < HUGE_BALANCE) {
      const before = existing.balance;
      existing.balance = HUGE_BALANCE;
      existing.version = (existing.version || 0) + 1;
      existing.lastTransaction = new Date();
      await existing.save();
      toppedUp++;
      await CreditTransaction.record({
        userId: u._id,
        type: 'admin_grant',
        amount: HUGE_BALANCE - before,
        balanceBefore: before,
        balanceAfter: HUGE_BALANCE,
        relatedEntity: null,
        metadata: { source: 'maintenance_script', reason: 'top up to huge test balance' }
      });
    }
  }

  console.log(`[FIX] Wallets created: ${createdWallets}, topped up: ${toppedUp}`);

  // Zone/POI mapping audit
  const zones = await Zone.find({ isActive: true }, { code: 1, poiCodes: 1 }).lean();
  const poiCodesInZones = new Set();
  zones.forEach(z => (z.poiCodes || []).forEach(code => poiCodesInZones.add(String(code).toUpperCase())));

  const pois = await Poi.find({ status: 'APPROVED' }, { code: 1 }).lean();
  const approvedCodes = new Set(pois.map(p => String(p.code).toUpperCase()));

  const missingPoiDocs = [...poiCodesInZones].filter(c => !approvedCodes.has(c));
  const orphanApprovedPois = [...approvedCodes].filter(c => !poiCodesInZones.has(c));

  console.log(`[AUDIT] Active zones: ${zones.length}`);
  console.log(`[AUDIT] POI codes in zones: ${poiCodesInZones.size}`);
  console.log(`[AUDIT] Approved POIs: ${approvedCodes.size}`);
  console.log(`[AUDIT] Missing POI docs referenced by zones: ${missingPoiDocs.length}`);
  console.log(`[AUDIT] Approved POIs not assigned to any active zone: ${orphanApprovedPois.length}`);

  if (missingPoiDocs.length) {
    console.log('[AUDIT] Missing POI codes:', missingPoiDocs.slice(0, 50));
  }
  if (orphanApprovedPois.length) {
    console.log('[AUDIT] Orphan POI codes:', orphanApprovedPois.slice(0, 50));
  }

  await mongoose.disconnect();
  console.log('[FIX] Done');
}

run().catch(async (err) => {
  console.error('[FIX] Failed:', err.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
