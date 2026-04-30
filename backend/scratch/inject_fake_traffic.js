const mongoose = require('mongoose');
require('dotenv').config({ path: 'C:/Users/KHOA/source/repos/VN-GO-Travel6/backend/.env' });
const PoiHourlyStats = require('../src/models/poi-hourly-stats.model');

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    
    const poiId = '69f32ec6848489e26168e38c'; // Heatmap Testing POI
    const now = new Date();
    
    // Create hourly stats for today
    const hoursToInject = [10, 11, 12, 13, 14];
    for (const h of hoursToInject) {
        const hourBucket = new Date(now);
        hourBucket.setUTCHours(h, 0, 0, 0);
        
        // Generate 5 unique device IDs for each hour
        const devices = [];
        for (let i = 0; i < 5; i++) {
            devices.push(`device-test-${h}-${i}`);
        }
        
        await PoiHourlyStats.findOneAndUpdate(
            { poi_id: poiId, hour_bucket: hourBucket },
            { 
                $addToSet: { unique_devices: { $each: devices } },
                $inc: { total_unique_visitors: devices.length },
                $set: { updated_at: new Date() }
            },
            { upsert: true }
        );
        console.log(`Injected 5 visits for hour ${h}:00`);
    }
    
    console.log('Fake traffic injection complete.');
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
