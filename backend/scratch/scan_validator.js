const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function testScan() {
    console.log('--- STEP 2.5: SCAN API VALIDATION ---');
    try {
        await mongoose.connect(process.env.MONGO_URI);
        
        const zoneService = require('../src/services/zone.service');
        const Zone = require('../src/models/zone.model');

        const zone = await Zone.findOne({ code: 'HO_CHI_MINH_CITY_DISTRICT_1' });
        if (!zone) {
            console.log('Zone not found');
            return;
        }

        console.log(`Generating token for zone: ${zone.code}`);
        const tokenData = await zoneService.generateZoneQrToken(zone._id);
        const token = tokenData.token;
        console.log('Token generated');

        console.log('Calling resolveZoneScanToken...');
        const result = await zoneService.resolveZoneScanToken(token);
        
        console.log('Result Zone:', result.zone.code);
        console.log('Result POI count:', result.pois.length);
        if (result.pois.length > 0) {
            console.log('First POI:', result.pois[0].code);
        } else {
            console.log('WARNING: POI list is EMPTY in scan result!');
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

testScan();
