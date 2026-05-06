const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function verifyProductionHardening() {
    console.log('--- VERIFYING PRODUCTION QR HARDENING ---');
    try {
        await mongoose.connect(process.env.MONGO_URI);
        
        const zoneService = require('../src/services/zone.service');
        const ScanLog = require('../src/models/scan-log.model');
        const Zone = require('../src/models/zone.model');
        const User = require('../src/models/user.model');

        const zoneCode = 'HO_CHI_MINH_CITY_DISTRICT_1';
        const zone = await Zone.findOne({ code: zoneCode });
        
        // 1. Generate Token
        console.log('\nGenerating token...');
        const tokenResult = await zoneService.generateZoneQrToken(zone._id);
        const token = tokenResult.token;

        // 2. Scan as a FREE user (anonymous)
        console.log('\nScanning as FREE user (anonymous)...');
        const freeResult = await zoneService.resolveZoneScanToken(token, null, {
            ip: '127.0.0.1',
            userAgent: 'Production-Tester/1.0'
        });

        const firstPoiFree = freeResult.pois[0];
        console.log('FREE User - Access:', freeResult.accessStatus.hasAccess);
        console.log('FREE User - NarrationLong:', firstPoiFree.narrationLong);
        console.log('FREE User - Audio URL:', firstPoiFree.audio.url);

        // 3. Scan as a PREMIUM user (who bought the zone)
        const premiumUser = await User.findOne({ email: 'test_purchaser@vngo.com' });
        if (premiumUser) {
            console.log('\nScanning as PAID user...');
            const paidResult = await zoneService.resolveZoneScanToken(token, premiumUser._id, {
                ip: '127.0.0.1',
                userAgent: 'Production-Tester/1.0'
            });

            const firstPoiPaid = paidResult.pois[0];
            console.log('PAID User - Access:', paidResult.accessStatus.hasAccess);
            console.log('PAID User - NarrationLong:', firstPoiPaid.narrationLong ? 'EXISTS (length: ' + firstPoiPaid.narrationLong.length + ')' : 'NULL');
            console.log('PAID User - Audio URL:', firstPoiPaid.audio.url);

            if (firstPoiFree.audio.url !== firstPoiPaid.audio.url) {
                console.log('✅ PASS: Audio URLs are segregated (different hashes)');
            } else {
                console.log('❌ FAIL: Audio URLs are the same (security leak potential)');
            }
        }

        // 4. Verify ScanLog
        const logs = await ScanLog.find({ zoneCode }).sort({ createdAt: -1 }).limit(2);
        console.log(`\nVerified ScanLog entries: ${logs.length}`);
        if (logs.length >= 2) {
            console.log('✅ PASS: ScanLog successfully recorded');
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

verifyProductionHardening();
