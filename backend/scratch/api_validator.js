const axios = require('axios');

async function testApi() {
    console.log('--- STEP 2: BACKEND API VALIDATION ---');
    try {
        const zoneCode = 'HO_CHI_MINH_CITY_DISTRICT_1';
        const url = `http://localhost:3000/api/v1/zones/${zoneCode}`;
        console.log(`GET ${url}`);
        
        const response = await axios.get(url);
        console.log('Status:', response.status);
        console.log('Response Body:', JSON.stringify(response.data, null, 2));
    } catch (err) {
        if (err.response) {
            console.error('API Error:', err.response.status, err.response.data);
        } else {
            console.error('Error:', err.message);
        }
    }
}

testApi();
