const axios = require('axios');
const API_BASE = 'http://localhost:3000/api/v1';

async function testApi() {
    try {
        console.log('--- BACKEND API 404 TEST ---');
        
        // 1. First, check if /zones/scan even exists (POST)
        console.log(`[TEST 1] Testing POST ${API_BASE}/zones/scan with empty body...`);
        try {
            await axios.post(`${API_BASE}/zones/scan`, {});
        } catch (err) {
            console.log(`Response Status: ${err.response?.status}`);
            console.log(`Response Body: ${JSON.stringify(err.response?.data)}`);
            
            if (err.response?.status === 404) {
                console.error('❌ CRITICAL: The endpoint /zones/scan returned 404. It might not be registered correctly.');
            } else {
                console.log('✅ Endpoint exists (did not return 404).');
            }
        }

        // 2. Check /public/zones/:code (GET)
        console.log(`\n[TEST 2] Testing GET ${API_BASE}/public/zones/HO_CHI_MINH_CITY_DISTRICT_1...`);
        try {
            const resp = await axios.get(`${API_BASE}/public/zones/HO_CHI_MINH_CITY_DISTRICT_1`);
            console.log(`Response Status: ${resp.status}`);
            console.log('✅ Public zone lookup works.');
        } catch (err) {
            console.error(`❌ Public zone lookup failed: ${err.response?.status}`);
        }

        // 3. Check /zones/:code (GET)
        console.log(`\n[TEST 3] Testing GET ${API_BASE}/zones/HO_CHI_MINH_CITY_DISTRICT_1...`);
        try {
            const resp = await axios.get(`${API_BASE}/zones/HO_CHI_MINH_CITY_DISTRICT_1`);
            console.log(`Response Status: ${resp.status}`);
            console.log('✅ Authenticated zone lookup works.');
        } catch (err) {
            console.error(`❌ Authenticated zone lookup failed: ${err.response?.status}`);
        }

    } catch (error) {
        console.error('Test script error:', error);
    }
}

testApi();
