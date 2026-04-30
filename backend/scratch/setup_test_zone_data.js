const mongoose = require('mongoose');
require('dotenv').config({ path: 'C:/Users/KHOA/source/repos/VN-GO-Travel6/backend/.env' });
const User = require('../src/models/user.model');
const Poi = require('../src/models/poi.model');
const Zone = require('../src/models/zone.model');

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    
    const owner = await User.findOne({ email: 'owner@vngo.com' });
    if (!owner) {
        console.log('Owner not found');
        process.exit(1);
    }
    
    // Assign POI to owner
    await Poi.updateOne({ code: 'VNM-SGN-001' }, { submittedBy: owner._id });
    console.log('Assigned VNM-SGN-001 to owner@vngo.com');
    
    // Create or update zone with this POI
    let zone = await Zone.findOne({ code: 'ZONE_HCM_D1' });
    if (!zone) {
        zone = await Zone.create({
            code: 'ZONE_HCM_D1',
            name: 'Ho Chi Minh City District 1',
            price: 100,
            poiCodes: ['VNM-SGN-001']
        });
        console.log('Created Zone: ZONE_HCM_D1');
    } else {
        zone.poiCodes = ['VNM-SGN-001'];
        await zone.save();
        console.log('Updated Zone: ZONE_HCM_D1');
    }
    
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
