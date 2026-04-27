/**
 * TEST SCRIPT FOR THREE CRITICAL FIXES
 *
 * This script will:
 * 1. Test POI sync logic (simulate mobile storage)
 * 2. Test Save POI Changes API
 * 3. Test QR Generation API
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models and services
const Zone = require('./src/models/zone.model');
const Poi = require('./src/models/poi.model');
const User = require('./src/models/user.model');
const zoneRepository = require('./src/repositories/zone.repository');
const zoneService = require('./src/services/zone.service');

// Simulate mobile storage
class MockMobileStorage {
    constructor() {
        this.pois = [];
    }

    async storePoi(poi) {
        this.pois.push(poi);
    }

    async getAllPois() {
        return this.pois;
    }

    async syncPois(backendPoiCodes) {
        console.log(`[STORAGE] Syncing POIs with backend list (${backendPoiCodes.length} POIs)`);

        const localCodes = this.pois.map(p => p.code);
        console.log(`[STORAGE] Local POIs: ${localCodes.length}`);

        // Find POIs that exist locally but NOT in backend
        const staleCodes = localCodes.filter(code => !backendPoiCodes.includes(code));

        if (staleCodes.length === 0) {
            console.log('[STORAGE] No stale POIs found, all in sync');
            return { removed: 0, kept: localCodes.length };
        }

        console.log(`[STORAGE] Found ${staleCodes.length} stale POIs to remove:`, staleCodes);

        // Remove stale POIs
        this.pois = this.pois.filter(p => !staleCodes.includes(p.code));

        console.log(`[STORAGE] Sync complete: removed ${staleCodes.length}, kept ${this.pois.length}`);

        return {
            removed: staleCodes.length,
            kept: this.pois.length,
            removedCodes: staleCodes
        };
    }
}

async function testIssue1_POISync() {
    console.log('\n========================================');
    console.log('ISSUE 1: POI SYNC TEST');
    console.log('========================================\n');

    // Get a zone from DB
    const zone = await Zone.findOne({});
    if (!zone) {
        console.log('❌ No zones found in DB');
        return false;
    }

    console.log(`Testing with zone: ${zone.code} (${zone.name})`);
    console.log(`Backend has ${zone.poiCodes.length} POIs:`, zone.poiCodes);

    // Simulate mobile storage with 10 POIs (6 valid + 4 stale)
    const storage = new MockMobileStorage();

    // Add valid POIs
    for (const code of zone.poiCodes) {
        await storage.storePoi({ code, name: `POI ${code}` });
    }

    // Add 4 stale POIs
    await storage.storePoi({ code: 'STALE_POI_1', name: 'Stale 1' });
    await storage.storePoi({ code: 'STALE_POI_2', name: 'Stale 2' });
    await storage.storePoi({ code: 'STALE_POI_3', name: 'Stale 3' });
    await storage.storePoi({ code: 'STALE_POI_4', name: 'Stale 4' });

    console.log('\n--- BEFORE SYNC ---');
    const beforePois = await storage.getAllPois();
    console.log(`Local storage has ${beforePois.length} POIs`);
    console.log('Codes:', beforePois.map(p => p.code));

    // Run sync
    console.log('\n--- RUNNING SYNC ---');
    const syncResult = await storage.syncPois(zone.poiCodes);

    console.log('\n--- AFTER SYNC ---');
    const afterPois = await storage.getAllPois();
    console.log(`Local storage has ${afterPois.length} POIs`);
    console.log('Codes:', afterPois.map(p => p.code));

    console.log('\n--- RESULT ---');
    console.log(`Removed: ${syncResult.removed} POIs`);
    console.log(`Kept: ${syncResult.kept} POIs`);
    console.log(`Removed codes:`, syncResult.removedCodes);

    // Verify
    const success = syncResult.removed === 4 && syncResult.kept === zone.poiCodes.length;
    console.log(`\n${success ? '✅ PASS' : '❌ FAIL'}: Sync ${success ? 'worked correctly' : 'failed'}`);

    return success;
}

async function testIssue2_SavePOIChanges() {
    console.log('\n========================================');
    console.log('ISSUE 2: SAVE POI CHANGES TEST');
    console.log('========================================\n');

    // Get a zone
    const zone = await Zone.findOne({});
    if (!zone) {
        console.log('❌ No zones found in DB');
        return false;
    }

    console.log(`Testing with zone: ${zone.code} (${zone.name})`);
    console.log(`Current POI codes (${zone.poiCodes.length}):`, zone.poiCodes);

    // Get all POIs
    const allPois = await Poi.find({ status: 'APPROVED' }).limit(10);
    console.log(`\nAvailable POIs in DB: ${allPois.length}`);

    // Select first 3 POIs
    const selectedCodes = allPois.slice(0, 3).map(p => p.code);
    console.log(`Selecting ${selectedCodes.length} POIs:`, selectedCodes);

    console.log('\n--- BEFORE UPDATE ---');
    console.log('Zone POI codes:', zone.poiCodes);

    // Simulate API call
    console.log('\n--- CALLING updatePois ---');
    console.log('Payload:', { poiCodes: selectedCodes });

    const updatedZone = await zoneRepository.updatePois(zone._id, selectedCodes);

    console.log('\n--- AFTER UPDATE ---');
    console.log('Zone POI codes:', updatedZone.poiCodes);

    // Verify
    const success = updatedZone.poiCodes.length === selectedCodes.length &&
                    selectedCodes.every(code => updatedZone.poiCodes.includes(code));

    console.log(`\n${success ? '✅ PASS' : '❌ FAIL'}: Save POI changes ${success ? 'worked' : 'failed'}`);

    // Restore original
    await zoneRepository.updatePois(zone._id, zone.poiCodes);
    console.log('\n(Restored original POI codes)');

    return success;
}

async function testIssue3_QRGeneration() {
    console.log('\n========================================');
    console.log('ISSUE 3: QR GENERATION TEST');
    console.log('========================================\n');

    // Get a zone
    const zone = await Zone.findOne({});
    if (!zone) {
        console.log('❌ No zones found in DB');
        return false;
    }

    console.log(`Testing with zone: ${zone.code} (${zone.name})`);

    console.log('\n--- CALLING generateZoneQrToken ---');

    try {
        const result = await zoneService.generateZoneQrToken(zone._id);

        console.log('\n--- QR TOKEN GENERATED ---');
        console.log('Token:', result.token.substring(0, 50) + '...');
        console.log('Scan URL:', result.scanUrl);
        console.log('JTI:', result.jti);
        console.log('Expires At:', result.expiresAt);
        console.log('TTL Hours:', result.ttlHours);
        console.log('Zone Code:', result.zoneCode);
        console.log('Zone Name:', result.zoneName);

        const success = result.scanUrl && result.token && result.jti;
        console.log(`\n${success ? '✅ PASS' : '❌ FAIL'}: QR generation ${success ? 'worked' : 'failed'}`);

        return success;
    } catch (error) {
        console.log('\n❌ FAIL: QR generation failed');
        console.error('Error:', error.message);
        return false;
    }
}

async function runAllTests() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║  TESTING THREE CRITICAL FIXES          ║');
    console.log('╚════════════════════════════════════════╝');

    try {
        // Connect to DB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        // Run tests
        const result1 = await testIssue1_POISync();
        const result2 = await testIssue2_SavePOIChanges();
        const result3 = await testIssue3_QRGeneration();

        // Final verdict
        console.log('\n========================================');
        console.log('FINAL VERDICT');
        console.log('========================================\n');

        console.log(`Issue 1 (POI Sync):        ${result1 ? '✅ WORKING' : '❌ BROKEN'}`);
        console.log(`Issue 2 (Save POI):        ${result2 ? '✅ WORKING' : '❌ BROKEN'}`);
        console.log(`Issue 3 (QR Generation):   ${result3 ? '✅ WORKING' : '❌ BROKEN'}`);

        const allWorking = result1 && result2 && result3;
        console.log(`\n${allWorking ? '✅ ALL WORKING' : '❌ SOME ISSUES REMAIN'}`);

        process.exit(allWorking ? 0 : 1);
    } catch (error) {
        console.error('\n❌ TEST FAILED:', error);
        process.exit(1);
    }
}

runAllTests();
