require('dotenv').config({ path: 'backend/.env' });
const connectDB = require('../src/config/db');
const zoneService = require('../src/services/zone.service');
const zoneRepository = require('../src/repositories/zone.repository');
const Zone = require('../src/models/zone.model');

async function simulateQrFlow() {
    try {
        console.log('--- QR SCAN E2E SIMULATION ---');
        await connectDB();

        // 1. Find an active zone
        const zone = await Zone.findOne({ isActive: true });
        if (!zone) {
            console.error('❌ No active zones found in DB. Please run seed first.');
            process.exit(1);
        }
        console.log(`✅ Found active zone: ${zone.name} (${zone.code}) [_id: ${zone._id}]`);

        // 2. Generate QR token (this mimics the Admin panel action)
        console.log('\n[PHASE 1] Generating QR token...');
        const qrData = await zoneService.generateZoneQrToken(zone._id);
        console.log('✅ Token generated successfully.');
        
        // Decode token to see payload
        const jwt = require('jsonwebtoken');
        const decoded = jwt.decode(qrData.token);
        console.log('📦 JWT Payload:', JSON.stringify(decoded, null, 2));

        console.log(`   Token (truncated): ${qrData.token.substring(0, 30)}...`);
        console.log(`   Scan URL: ${qrData.scanUrl}`);

        // 3. Resolve QR token (this mimics the Mobile App scanning action)
        console.log('\n[PHASE 2] Resolving QR token...');
        try {
            const resolved = await zoneService.resolveZoneScanToken(qrData.token, null, {
                ip: '127.0.0.1',
                userAgent: 'SIMULATOR-BOT'
            });
            console.log('✅ Token resolved successfully!');
            console.log(`   Resolved Zone: ${resolved.zone.name} (${resolved.zone.code})`);
            console.log(`   POIs Found: ${resolved.pois.length}`);
            console.log(`   Access Status: ${resolved.accessStatus.status}`);
        } catch (err) {
            console.error(`❌ RESOLUTION FAILED: ${err.message} (Status: ${err.statusCode || 'N/A'})`);
            
            if (err.message === 'Zone not found' && err.statusCode === 404) {
                console.log('\n🔍 ANALYSIS: The service could not find the zone by the code stored in the JWT.');
                console.log(`   JWT contains zoneCode: ${zone.code}`);
                console.log('   Checking zoneRepository.findByCode directly...');
                const check = await zoneRepository.findByCode(zone.code);
                console.log(`   direct repository lookup: ${check ? 'SUCCESS' : 'FAILED'}`);
            }
        }

        // 4. Test with an invalid/modified token
        console.log('\n[PHASE 3] Testing with invalid token...');
        try {
            await zoneService.resolveZoneScanToken('invalid.token.here');
        } catch (err) {
            console.log(`✅ Correctly caught invalid token: ${err.message}`);
        }

        process.exit(0);
    } catch (error) {
        console.error('SIMULATION ERROR:', error);
        process.exit(1);
    }
}

simulateQrFlow();
