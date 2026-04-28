const axios = require('axios');
const mongoose = require('mongoose');

async function verify() {
    console.log('--- STARTING VERIFICATION ---');
    
    // 1. Login to get token
    const loginRes = await axios.post('http://localhost:3000/api/v1/auth/login', {
        email: 'admin@vngo.com',
        password: 'password123'
    });
    const token = loginRes.data.data.token;
    console.log('Login successful');

    // 2. Fetch Zones
    const zonesRes = await axios.get('http://localhost:3000/api/v1/admin/zones', {
        headers: { Authorization: `Bearer ${token}` }
    });
    
    const hcmc = zonesRes.data.data.find(z => z.name.includes('Ho Chi Minh City District 1'));
    if (hcmc) {
        console.log(`\nZone: ${hcmc.name}`);
        console.log(`ID: ${hcmc._id}`);
        console.log(`Code: ${hcmc.code}`);
        console.log(`POI Codes in API: ${JSON.stringify(hcmc.poiCodes)}`);
        console.log(`Count: ${hcmc.poiCodes.length}`);
    } else {
        console.log('HCMC Zone not found');
    }

    // 3. Direct DB Check
    try {
        await mongoose.connect('mongodb://localhost:27017/vngo');
        const zoneSchema = new mongoose.Schema({ name: String, poiCodes: [String] });
        const Zone = mongoose.model('Zone', zoneSchema, 'zones');
        
        const dbZone = await Zone.findOne({ name: /Ho Chi Minh City District 1/ });
        if (dbZone) {
            console.log('\n--- DB TRUTH ---');
            console.log(`Zone: ${dbZone.name}`);
            console.log(`POI Codes in DB: ${JSON.stringify(dbZone.poiCodes)}`);
            console.log(`Count: ${dbZone.poiCodes.length}`);
        }
        await mongoose.disconnect();
    } catch (err) {
        console.error('DB Connection error:', err.message);
    }
}

verify();
