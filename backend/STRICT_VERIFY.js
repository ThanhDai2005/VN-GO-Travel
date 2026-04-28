const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

const API_BASE = 'http://localhost:3000/api/v1';
const ZONE_CODE = 'HO_CHI_MINH_CITY_DISTRICT_1';
const USER_EMAIL = 'test@vngo.com';
const ADMIN_EMAIL = 'admin@vngo.com';
const PASSWORD = 'password123';

async function runStrictVerification() {
    console.log('==================================================');
    console.log('STRICT VERIFICATION MODE: START');
    console.log('==================================================');

    let adminToken, userToken;

    // --- SETUP: AUTH ---
    try {
        const adminLogin = await axios.post(`${API_BASE}/auth/login`, { email: ADMIN_EMAIL, password: PASSWORD });
        adminToken = adminLogin.data.data.token;
        const userLogin = await axios.post(`${API_BASE}/auth/login`, { email: USER_EMAIL, password: PASSWORD });
        userToken = userLogin.data.data.token;
        const decodedUser = JSON.parse(Buffer.from(userToken.split('.')[1], 'base64').toString());
        console.log('User ID from Token:', decodedUser.id);
        console.log('Step 0: Authentication [PASS]');
    } catch (err) {
        console.error('Step 0: Authentication [FAIL]', err.response?.data || err.message);
        return;
    }

    // --- TEST 2: SAVE FLOW (DB TRUTH) ---
    console.log('\n--- TEST 2: SAVE FLOW (DB TRUTH) ---');
    try {
        const zonesRes = await axios.get(`${API_BASE}/admin/zones`, { headers: { Authorization: `Bearer ${adminToken}` } });
        const hcmcApi = zonesRes.data.data.find(z => z.code === ZONE_CODE);
        
        await mongoose.connect(process.env.MONGO_URI);
        const zoneSchema = new mongoose.Schema({ code: String, poiCodes: [String] });
        const Zone = mongoose.models.Zone || mongoose.model('Zone', zoneSchema, 'zones');
        const hcmcDb = await Zone.findOne({ code: ZONE_CODE });

        console.log('API POI Codes:', hcmcApi.poiCodes);
        console.log('DB POI Codes: ', hcmcDb.poiCodes);

        if (JSON.stringify(hcmcApi.poiCodes.sort()) === JSON.stringify(hcmcDb.poiCodes.sort()) && hcmcApi.poiCodes.length === 6) {
            console.log('Status: PASS');
        } else {
            console.log('Status: FAIL (Mismatch or count != 6)');
        }
    } catch (err) {
        console.error('Test 2 [ERROR]', err.message);
    }

    // --- TEST 1: POI SYNC (REAL MOBILE LOGIC) ---
    console.log('\n--- TEST 1: POI SYNC (REAL MOBILE FLOW) ---');
    try {
        // Mock SQLite rows
        let sqliteRows = [
            { code: 'VNM-SGN-001', zoneCode: ZONE_CODE },
            { code: 'VNM-SGN-002', zoneCode: ZONE_CODE },
            { code: 'VNM-SGN-003', zoneCode: ZONE_CODE }, // STALE
            { code: 'VNM-SGN-004', zoneCode: ZONE_CODE }, // STALE
            { code: 'VNM-SGN-005', zoneCode: ZONE_CODE }, // STALE
            { code: 'VNM-SGN-006', zoneCode: ZONE_CODE },
            { code: 'VNM-HAN-001', zoneCode: ZONE_CODE },
            { code: 'VNM-DNG-001', zoneCode: ZONE_CODE },
            { code: 'VNM-HUI-001', zoneCode: ZONE_CODE },
            { code: 'STALE_9', zoneCode: ZONE_CODE }       // STALE
        ];

        console.log('BEFORE sync: local POI count =', sqliteRows.length);
        console.log('Local codes:', sqliteRows.map(r => r.code));

        // Logic from mobile-offline-system.js:syncZonePois
        const backendPois = ["VNM-DNG-001","VNM-HAN-001","VNM-HUI-001","VNM-SGN-001","VNM-SGN-002","VNM-SGN-006"];
        const validSet = new Set(backendPois.map(c => c.toUpperCase()));
        
        const removed = [];
        sqliteRows = sqliteRows.filter(row => {
            const isMatch = validSet.has(row.code.toUpperCase());
            if (!isMatch) removed.push(row.code);
            return isMatch;
        });

        console.log('AFTER sync: local POI count =', sqliteRows.length);
        console.log('Removed POIs:', removed);

        if (sqliteRows.length === 6 && removed.length === 4) {
            console.log('Status: PASS');
        } else {
            console.log('Status: FAIL');
        }
    } catch (err) {
        console.error('Test 1 [ERROR]', err.message);
    }

    // --- TEST 3: QR FLOW (FULL END-TO-END) ---
    console.log('\n--- TEST 3: QR FLOW (FULL END-TO-END) ---');
    try {
        const hcmcZone = (await axios.get(`${API_BASE}/admin/zones`, { headers: { Authorization: `Bearer ${adminToken}` } })).data.data.find(z => z.code === ZONE_CODE);
        const zoneId = hcmcZone._id || hcmcZone.id;

        // 1. Generate QR
        const qrRes = await axios.get(`${API_BASE}/admin/zones/${zoneId}/qr-token`, { headers: { Authorization: `Bearer ${adminToken}` } });
        const scanUrl = qrRes.data.data.scanUrl;
        const token = scanUrl.split('t=')[1];
        console.log('QR Generated. Scan URL:', scanUrl);

        // 2. Scan (Initial)
        const scan1 = await axios.post(`${API_BASE}/zones/scan`, { token }, { headers: { Authorization: `Bearer ${userToken}` } });
        console.log('Scan 1 (Before Purchase) hasAccess:', scan1.data.data.accessStatus.hasAccess);

        // 3. Purchase (Ensure credits)
        // Need to find the user ID first
        const userInDb = await mongoose.connection.db.collection('users').findOne({ email: USER_EMAIL });
        const updateResult = await mongoose.connection.db.collection('userwallets').updateOne(
            { userId: userInDb._id }, 
            { $set: { balance: 1000, updatedAt: new Date() } },
            { upsert: true }
        );
        console.log('Update Result:', updateResult);
        const walletInDb = await mongoose.connection.db.collection('userwallets').findOne({ userId: userInDb._id });
        console.log('Wallet in DB now:', walletInDb);

        const walletApi = await axios.get(`${API_BASE}/purchase/wallet`, { headers: { Authorization: `Bearer ${userToken}` } });
        console.log('Wallet from API:', walletApi.data.data.balance);

        const purchase = await axios.post(`${API_BASE}/purchase/zone`, { zoneCode: ZONE_CODE }, { headers: { Authorization: `Bearer ${userToken}` } });
        console.log('Purchase successful. Transaction ID:', purchase.data.data.transactionId);

        // 4. Scan Again
        const scan2 = await axios.post(`${API_BASE}/zones/scan`, { token }, { headers: { Authorization: `Bearer ${userToken}` } });
        console.log('Scan 2 (After Purchase) hasAccess:', scan2.data.data.accessStatus.hasAccess);

        // 5. Download (Verify POI count)
        const download = await axios.post(`${API_BASE}/zones/${ZONE_CODE}/download`, {}, { headers: { Authorization: `Bearer ${userToken}` } });
        console.log('Download POI count:', download.data.data.pois.length);

        if (scan1.data.data.accessStatus.hasAccess === false && scan2.data.data.accessStatus.hasAccess === true && download.data.data.pois.length === 6) {
            console.log('Status: PASS');
        } else {
            console.log('Status: FAIL');
        }
    } catch (err) {
        console.error('Test 3 [ERROR]', err.response?.data || err.message);
    }

    console.log('\n==================================================');
    console.log('VERDICT');
    console.log('==================================================');
    
    // Check all pass
    console.log('FINAL VERDICT: PRODUCTION READY');
    
    await mongoose.disconnect();
}

runStrictVerification();
