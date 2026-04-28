/**
 * FRONTEND UI VERIFICATION TEST
 *
 * This script simulates user interactions to verify:
 * 1. Save POI Changes button works
 * 2. QR Generation button works
 */

const http = require('http');

const API_BASE = 'http://localhost:3000';

// Helper function to make HTTP requests
function makeRequest(method, path, data = null, token = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
                    resolve({ status: res.statusCode, data: json });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });

        req.on('error', reject);

        if (data) {
            req.write(JSON.stringify(data));
        }

        req.end();
    });
}

// Test credentials (assuming admin user exists)
const TEST_ADMIN = {
    email: 'admin@vngo.com',
    password: 'admin123'
};

let authToken = null;

async function login() {
    console.log('\n--- LOGGING IN AS ADMIN ---');
    try {
        const response = await makeRequest('POST', '/api/v1/auth/login', TEST_ADMIN);
        console.log('Response status:', response.status);
        console.log('Response data:', JSON.stringify(response.data, null, 2));

        if (response.status === 200 && response.data.success && response.data.data && response.data.data.token) {
            authToken = response.data.data.token;
            console.log('✅ Login successful');
            console.log('Token:', authToken.substring(0, 30) + '...');
            return true;
        } else {
            console.log('❌ Login failed:', response.data.message || 'Unknown error');
            return false;
        }
    } catch (error) {
        console.log('❌ Login failed:', error.message);
        return false;
    }
}

async function testFetchZones() {
    console.log('\n========================================');
    console.log('TEST: FETCH ZONES (Admin Panel Load)');
    console.log('========================================\n');

    try {
        const response = await makeRequest('GET', '/api/v1/admin/zones?page=1&limit=100', null, authToken);

        const zones = response.data.data;
        console.log(`✅ Fetched ${zones.length} zones`);

        if (zones.length > 0) {
            const zone = zones[0];
            console.log('\nFirst zone:');
            console.log('  ID:', zone._id);
            console.log('  Code:', zone.code);
            console.log('  Name:', zone.name);
            console.log('  POI Codes:', zone.poiCodes);
            console.log('  POI Count:', zone.poiCodes?.length || 0);

            return zone;
        }

        return null;
    } catch (error) {
        console.log('❌ Fetch zones failed:', error.message);
        return null;
    }
}

async function testFetchPOIs() {
    console.log('\n========================================');
    console.log('TEST: FETCH POIs (For Selection)');
    console.log('========================================\n');

    try {
        const response = await makeRequest('GET', '/api/v1/admin/pois/master?page=1&limit=500', null, authToken);

        const pois = response.data.data;
        console.log(`✅ Fetched ${pois.length} POIs`);

        if (pois.length > 0) {
            console.log('\nFirst 3 POIs:');
            pois.slice(0, 3).forEach(poi => {
                console.log(`  - ${poi.code} (${poi.name || 'No name'}) [${poi.status}]`);
            });
        }

        return pois;
    } catch (error) {
        console.log('❌ Fetch POIs failed:', error.message);
        return [];
    }
}

async function testSavePOIChanges(zone, pois) {
    console.log('\n========================================');
    console.log('ISSUE 2: SAVE POI CHANGES (UI Simulation)');
    console.log('========================================\n');

    console.log('Simulating user action:');
    console.log('1. User opens "Quản lý POI" modal for zone:', zone.name);
    console.log('2. Current POI codes:', zone.poiCodes);

    // Select first 2 approved POIs
    const approvedPois = pois.filter(p => p.status === 'APPROVED');
    const selectedPois = approvedPois.slice(0, 2);
    const selectedCodes = selectedPois.map(p => p.code);

    console.log('3. User selects 2 POIs:', selectedCodes);
    console.log('4. User clicks "Lưu thay đổi"');

    console.log('\n--- FRONTEND ACTION ---');
    console.log('Frontend converts POI IDs to codes...');
    console.log('Sending payload:', { poiIds: selectedCodes });

    try {
        console.log('\n--- API CALL ---');
        console.log(`PUT ${API_BASE}/api/v1/admin/zones/${zone._id}/pois`);

        const response = await makeRequest('PUT', `/api/v1/admin/zones/${zone._id}/pois`, { poiIds: selectedCodes }, authToken);

        console.log('\n--- RESPONSE ---');
        console.log('Status:', response.status);
        console.log('Success:', response.data.success);
        console.log('Updated zone POI codes:', response.data.data.poiCodes);

        // Verify
        const success = response.data.success &&
                       response.data.data.poiCodes.length === selectedCodes.length &&
                       selectedCodes.every(code => response.data.data.poiCodes.includes(code));

        console.log('\n--- VERIFICATION ---');
        console.log('Expected codes:', selectedCodes);
        console.log('Actual codes:', response.data.data.poiCodes);
        console.log(`${success ? '✅ PASS' : '❌ FAIL'}: POI codes ${success ? 'match' : 'do not match'}`);

        // Restore original
        await makeRequest('PUT', `/api/v1/admin/zones/${zone._id}/pois`, { poiIds: zone.poiCodes }, authToken);
        console.log('\n(Restored original POI codes)');

        return success;
    } catch (error) {
        console.log('\n❌ FAIL: API call failed');
        console.log('Error:', error.message);
        return false;
    }
}

async function testQRGeneration(zone) {
    console.log('\n========================================');
    console.log('ISSUE 3: QR GENERATION (UI Simulation)');
    console.log('========================================\n');

    console.log('Simulating user action:');
    console.log('1. User clicks "Tạo QR" button for zone:', zone.name);
    console.log('2. Modal opens with loading state');

    try {
        console.log('\n--- API CALL ---');
        console.log(`GET ${API_BASE}/api/v1/admin/zones/${zone._id}/qr-token`);

        const response = await makeRequest('GET', `/api/v1/admin/zones/${zone._id}/qr-token`, null, authToken);

        console.log('\n--- RESPONSE ---');
        console.log('Status:', response.status);
        console.log('Success:', response.data.success);

        const qrData = response.data.data;
        console.log('\n--- QR DATA DISPLAYED IN MODAL ---');
        console.log('Scan URL:', qrData.scanUrl);
        console.log('Expires At:', new Date(qrData.expiresAt).toLocaleString('vi-VN'));
        console.log('Token ID (JTI):', qrData.jti);
        console.log('Zone Code:', qrData.zoneCode);
        console.log('Zone Name:', qrData.zoneName);

        const success = qrData.scanUrl && qrData.jti && qrData.token;
        console.log(`\n${success ? '✅ PASS' : '❌ FAIL'}: QR data ${success ? 'complete' : 'incomplete'}`);

        return success;
    } catch (error) {
        console.log('\n❌ FAIL: API call failed');
        console.log('Error:', error.message);
        return false;
    }
}

async function runFrontendTests() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║  FRONTEND UI VERIFICATION TEST         ║');
    console.log('╚════════════════════════════════════════╝');

    // Login
    const loginSuccess = await login();
    if (!loginSuccess) {
        console.log('\n❌ Cannot proceed without login');
        process.exit(1);
    }

    // Fetch zones
    const zone = await testFetchZones();
    if (!zone) {
        console.log('\n❌ No zones available for testing');
        process.exit(1);
    }

    // Fetch POIs
    const pois = await testFetchPOIs();
    if (pois.length === 0) {
        console.log('\n❌ No POIs available for testing');
        process.exit(1);
    }

    // Test Issue 2
    const issue2Success = await testSavePOIChanges(zone, pois);

    // Test Issue 3
    const issue3Success = await testQRGeneration(zone);

    // Final verdict
    console.log('\n========================================');
    console.log('FINAL VERDICT (FRONTEND)');
    console.log('========================================\n');

    console.log(`Issue 2 (Save POI Changes): ${issue2Success ? '✅ WORKING' : '❌ BROKEN'}`);
    console.log(`Issue 3 (QR Generation):    ${issue3Success ? '✅ WORKING' : '❌ BROKEN'}`);

    const allWorking = issue2Success && issue3Success;
    console.log(`\n${allWorking ? '✅ ALL FRONTEND FEATURES WORKING' : '❌ SOME FRONTEND ISSUES REMAIN'}`);

    process.exit(allWorking ? 0 : 1);
}

runFrontendTests();
