const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function testScan() {
    console.log('--- STEP 2.6: JSON FORMAT VALIDATION ---');
    try {
        await mongoose.connect(process.env.MONGO_URI);
        
        const zoneService = require('../src/services/zone.service');
        const Zone = require('../src/models/zone.model');

        const zone = await Zone.findOne({ code: 'HO_CHI_MINH_CITY_DISTRICT_1' });
        const tokenData = await zoneService.generateZoneQrToken(zone._id);
        const result = await zoneService.resolveZoneScanToken(tokenData.token);
        
        console.log('POI Location format in response:');
        console.log(JSON.stringify(result.pois[0].location, null, 2));

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

testScan();
