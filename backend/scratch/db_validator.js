const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function runAnalysis() {
    console.log('--- STEP 1: DATABASE VALIDATION ---');
    try {
        await mongoose.connect(process.env.MONGO_URI);
        
        const Zone = require('../src/models/zone.model');
        const Poi = require('../src/models/poi.model');
        const ZonePoi = require('../src/models/zone-poi.model');

        const zoneCode = 'HO_CHI_MINH_CITY_DISTRICT_1';
        const zone = await Zone.findOne({ code: zoneCode });
        
        if (!zone) {
            console.log(`Zone ${zoneCode} not found!`);
            await mongoose.disconnect();
            return;
        }

        console.log(`zoneCode: ${zone.code}`);
        console.log(`number of POIs in DB (poiCodes): ${zone.poiCodes.length}`);
        
        const pois = await Poi.find({ code: { $in: zone.poiCodes } });
        console.log(`number of POIs in collection: ${pois.length}`);
        
        if (pois.length > 0) {
            console.log('sample POI document:');
            console.log(JSON.stringify(pois[0], null, 2));
        }

        const mappings = await ZonePoi.find({ zoneId: zone._id });
        console.log(`ZonePoi mapping count: ${mappings.length}`);

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

runAnalysis();
