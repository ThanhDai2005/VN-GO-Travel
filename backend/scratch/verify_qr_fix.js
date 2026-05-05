const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function verifyFix() {
    console.log('--- VERIFYING QR SCAN JSON FIX ---');
    try {
        await mongoose.connect(process.env.MONGO_URI);
        
        const poiService = require('../src/services/poi.service');
        const poiCode = 'CHO_BEN_THANH';
        
        const result = await poiService.getPoiByCode(poiCode, 'vi');
        
        console.log('POI content field type:', typeof result.content);
        console.log('POI content value:', JSON.stringify(result.content, null, 2));

        if (typeof result.content === 'object' && result.content !== null) {
            console.log('✅ PASS: content is an object');
            if (result.content.vi) {
                console.log('✅ PASS: content has "vi" property');
            } else {
                console.log('❌ FAIL: content missing "vi" property');
            }
        } else {
            console.log('❌ FAIL: content is NOT an object');
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

verifyFix();
