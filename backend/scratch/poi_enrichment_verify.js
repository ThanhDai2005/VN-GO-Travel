const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function verifyPoiEnrichment() {
    console.log('--- VERIFYING POI ENRICHMENT & ACCESS ---');
    try {
        await mongoose.connect(process.env.MONGO_URI);
        
        const poiService = require('../src/services/poi.service');
        const User = require('../src/models/user.model');
        const Zone = require('../src/models/zone.model');
        const purchaseService = require('../src/services/purchase.service');

        // 1. Check if purchasePoi is disabled
        console.log('\nChecking if purchasePoi is disabled...');
        try {
            await purchaseService.purchasePoi('69f757407ca5ededbf1c1366', 'P1');
            console.log('❌ FAIL: purchasePoi is still enabled!');
        } catch (err) {
            console.log(`✅ PASS: purchasePoi threw error: ${err.message}`);
        }

        // 2. Check getPoiByCode enrichment
        const poiCode = 'CHO_BEN_THANH'; // From HCMC Zone
        console.log(`\nFetching POI detail for: ${poiCode}`);
        
        // Mock a user ID (the test purchaser from earlier who already bought HCMC zone)
        const user = await User.findOne({ email: 'test_purchaser@vngo.com' });
        const userId = user ? user._id : null;

        const result = await poiService.getPoiByCode(poiCode, 'vi', userId);
        console.log('POI Data:', JSON.stringify({
            code: result.code,
            zoneCode: result.zoneCode,
            zoneName: result.zoneName,
            hasAccess: result.accessStatus?.allowed
        }, null, 2));

        if (result.zoneCode === 'HO_CHI_MINH_CITY_DISTRICT_1') {
            console.log('✅ PASS: Zone association correct');
        } else {
            console.log('❌ FAIL: Zone association missing or incorrect');
        }

        if (userId && result.accessStatus?.allowed) {
            console.log('✅ PASS: Access status included and correct');
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

verifyPoiEnrichment();
