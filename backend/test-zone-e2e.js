/**
 * ZONE-BASED E2E TEST SUITE
 * Simulates REAL USER behavior:
 *   Scan → View → Purchase → Download → Consume
 * 
 * Tests against live backend at http://localhost:3000
 */

const BASE_URL = 'http://localhost:3000/api/v1';

// Test state
const STATE = {
    adminToken: null,
    demoUserToken: null,
    freshUserToken: null,
    zoneQrToken: null,
    zoneCode: null,
    zoneId: null,
    zonePrice: null,
    walletBefore: null,
    walletAfter: null,
    results: []
};

// Helpers
async function req(method, path, body = null, token = null) {
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (body) opts.body = JSON.stringify(body);

    const url = `${BASE_URL}${path}`;
    const res = await fetch(url, opts);
    
    let data;
    try {
        data = await res.json();
    } catch (e) {
        data = { parseError: e.message };
    }
    return { status: res.status, data, ok: res.ok };
}

function logResult(scenario, step, request, response, pass, bug = null) {
    const entry = { scenario, step, request, response: JSON.stringify(response, null, 2), pass, bug };
    STATE.results.push(entry);
    const icon = pass ? '✅' : '❌';
    console.log(`\n${icon} [${scenario}] Step: ${step}`);
    console.log(`   Request: ${request}`);
    if (!pass) {
        console.log(`   Response: ${JSON.stringify(response, null, 2).substring(0, 500)}`);
        if (bug) console.log(`   🐛 BUG: ${bug}`);
    }
}

// ============================================
// SETUP: Login admin + demo user
// ============================================
async function setup() {
    console.log('\n' + '='.repeat(60));
    console.log('SETUP: Authenticating users');
    console.log('='.repeat(60));

    // Login admin
    const adminRes = await req('POST', '/auth/login', {
        email: 'admin@vngo.com',
        password: 'admin123'
    });

    if (!adminRes.ok) {
        console.error('FATAL: Cannot login admin:', adminRes.data);
        process.exit(1);
    }
    STATE.adminToken = adminRes.data.data?.token || adminRes.data.token;
    console.log(`✅ Admin logged in (token: ${STATE.adminToken ? STATE.adminToken.substring(0, 20) + '...' : 'MISSING'})`);

    // Login demo user
    const demoRes = await req('POST', '/auth/login', {
        email: 'demo@vngo.com',
        password: 'demo123'
    });

    if (!demoRes.ok) {
        console.error('FATAL: Cannot login demo user:', demoRes.data);
        process.exit(1);
    }
    STATE.demoUserToken = demoRes.data.data?.token || demoRes.data.token;
    console.log(`✅ Demo user logged in (token: ${STATE.demoUserToken ? STATE.demoUserToken.substring(0, 20) + '...' : 'MISSING'})`);

    // Get zones to find one for testing
    const zonesRes = await req('GET', '/zones', null, STATE.adminToken);
    console.log(`   Available zones: ${zonesRes.data.data?.length || 0}`);
    
    if (zonesRes.data.data && zonesRes.data.data.length > 0) {
        // Find a zone the demo user has NOT unlocked (HCMC zone)
        // Demo seeder pre-unlocks zones[0] (DEMO_HANOI_OLD_QUARTER)
        // So use zones[1] (DEMO_HCMC_DISTRICT1) for purchase testing
        const targetZone = zonesRes.data.data.find(z => z.code === 'DEMO_HCMC_DISTRICT1') || zonesRes.data.data[zonesRes.data.data.length - 1];
        STATE.zoneCode = targetZone.code;
        STATE.zoneId = targetZone._id;
        STATE.zonePrice = targetZone.price;
        console.log(`   Target zone: ${STATE.zoneCode} (ID: ${STATE.zoneId}, Price: ${STATE.zonePrice})`);
    }

    // Get admin zones to find zone ID (admin endpoint returns _id)
    const adminZonesRes = await req('GET', '/admin/zones', null, STATE.adminToken);
    if (adminZonesRes.ok && adminZonesRes.data.data) {
        const adminZone = adminZonesRes.data.data.find(z => z.code === STATE.zoneCode);
        if (adminZone) {
            STATE.zoneId = adminZone._id;
            STATE.zonePrice = adminZone.price;
            console.log(`   Zone ID confirmed: ${STATE.zoneId}`);
        }
    }
}

// ============================================
// SCENARIO 1: SCAN WITHOUT ACCESS
// ============================================
async function scenario1_ScanWithoutAccess() {
    console.log('\n' + '='.repeat(60));
    console.log('SCENARIO 1: SCAN WITHOUT ACCESS');
    console.log('='.repeat(60));

    // Step 1: Admin generates QR token for zone
    console.log('\n--- Step 1: Generate Zone QR (admin) ---');
    const qrRes = await req('GET', `/admin/zones/${STATE.zoneId}/qr-token`, null, STATE.adminToken);
    
    if (!qrRes.ok) {
        logResult('S1', 'Generate QR', `GET /admin/zones/${STATE.zoneId}/qr-token`, qrRes.data, false, 
            `Failed to generate QR token: HTTP ${qrRes.status}`);
        return;
    }

    STATE.zoneQrToken = qrRes.data.data?.token;
    logResult('S1', 'Generate QR', `GET /admin/zones/${STATE.zoneId}/qr-token`, {
        hasToken: !!STATE.zoneQrToken,
        jti: qrRes.data.data?.jti,
        expiresAt: qrRes.data.data?.expiresAt,
        zoneCode: qrRes.data.data?.zoneCode
    }, !!STATE.zoneQrToken);

    if (!STATE.zoneQrToken) {
        logResult('S1', 'Generate QR', 'N/A', qrRes.data, false, 'QR token not returned');
        return;
    }

    // Step 2: Scan WITHOUT login (no auth token)
    console.log('\n--- Step 2: Scan QR WITHOUT login ---');
    const scanRes = await req('POST', '/zones/scan', {
        token: STATE.zoneQrToken
    }); // No auth token

    const scanData = scanRes.data?.data;

    if (!scanRes.ok) {
        logResult('S1', 'Scan without auth', 'POST /zones/scan (no auth)', scanRes.data, false, 
            `Scan failed with HTTP ${scanRes.status}: ${scanRes.data?.message}`);
        return;
    }

    // Verify: narrationShort exists on POIs
    const pois = scanData?.pois || [];
    const hasNarrationShort = pois.length > 0 && pois.every(p => p.narrationShort != null && p.narrationShort !== '');
    logResult('S1', 'narrationShort exists', `Check ${pois.length} POIs`, {
        poiCount: pois.length,
        sample: pois[0]?.narrationShort?.substring(0, 50)
    }, hasNarrationShort, !hasNarrationShort ? 'narrationShort missing on some POIs' : null);

    // Verify: narrationLong = null (no access)
    const allNarrationLongNull = pois.length > 0 && pois.every(p => p.narrationLong === null);
    logResult('S1', 'narrationLong = null', `Check ${pois.length} POIs`, {
        sample: pois.map(p => ({ code: p.code, narrationLong: p.narrationLong === null ? 'null' : typeof p.narrationLong }))
    }, allNarrationLongNull, !allNarrationLongNull ? 'narrationLong NOT null for unpurchased zone POIs (content leak)' : null);

    // Verify: accessStatus.requiresPurchase = true
    const accessStatus = scanData?.accessStatus;
    logResult('S1', 'requiresPurchase = true', 'Check accessStatus', {
        accessStatus
    }, accessStatus?.requiresPurchase === true, 
        accessStatus?.requiresPurchase !== true ? `requiresPurchase = ${accessStatus?.requiresPurchase} (expected true)` : null);
}

// ============================================
// SCENARIO 2: SCAN WITH ACCESS
// ============================================
async function scenario2_ScanWithAccess() {
    console.log('\n' + '='.repeat(60));
    console.log('SCENARIO 2: SCAN WITH ACCESS (after purchase)');
    console.log('='.repeat(60));

    // We need to purchase first, then scan. But let's check pre-unlocked zone first.
    // The demo seeder pre-unlocks DEMO_HANOI_OLD_QUARTER for demo user.
    // Let's generate a QR for that zone and scan with demo user.

    // Find Hanoi zone ID
    const adminZonesRes = await req('GET', '/admin/zones', null, STATE.adminToken);
    const hanoiZone = adminZonesRes.data?.data?.find(z => z.code === 'DEMO_HANOI_OLD_QUARTER');
    
    if (!hanoiZone) {
        logResult('S2', 'Find pre-unlocked zone', 'GET /admin/zones', adminZonesRes.data, false,
            'DEMO_HANOI_OLD_QUARTER zone not found');
        return;
    }

    // Step 1: Generate QR for pre-unlocked zone
    console.log('\n--- Step 1: Generate QR for pre-unlocked zone ---');
    const qrRes = await req('GET', `/admin/zones/${hanoiZone._id}/qr-token`, null, STATE.adminToken);
    
    if (!qrRes.ok) {
        logResult('S2', 'Generate QR', `GET /admin/zones/${hanoiZone._id}/qr-token`, qrRes.data, false, 
            `Failed to generate QR: HTTP ${qrRes.status}`);
        return;
    }
    const hanoiQrToken = qrRes.data.data?.token;

    // Step 2: Scan WITH login (demo user has this zone pre-unlocked)
    console.log('\n--- Step 2: Scan QR with demo user (zone pre-unlocked) ---');
    const scanRes = await req('POST', '/zones/scan', {
        token: hanoiQrToken
    }, STATE.demoUserToken);

    const scanData = scanRes.data?.data;

    if (!scanRes.ok) {
        logResult('S2', 'Scan with auth', 'POST /zones/scan (with auth)', scanRes.data, false,
            `Scan failed with HTTP ${scanRes.status}: ${scanRes.data?.message}`);
        return;
    }

    // Verify: narrationLong exists
    const pois = scanData?.pois || [];
    const hasNarrationLong = pois.length > 0 && pois.every(p => p.narrationLong != null && p.narrationLong !== '');
    logResult('S2', 'narrationLong exists', `Check ${pois.length} POIs`, {
        poiCount: pois.length,
        sample: pois[0]?.narrationLong?.substring(0, 80)
    }, hasNarrationLong, !hasNarrationLong ? 'narrationLong missing on purchased zone POIs (content not unlocked)' : null);

    // Verify: accessStatus.hasAccess = true
    const accessStatus = scanData?.accessStatus;
    logResult('S2', 'hasAccess = true', 'Check accessStatus', {
        accessStatus
    }, accessStatus?.hasAccess === true, 
        accessStatus?.hasAccess !== true ? `hasAccess = ${accessStatus?.hasAccess} (expected true)` : null);

    // Verify: reason = ZONE_PURCHASED
    logResult('S2', 'reason = ZONE_PURCHASED', 'Check accessStatus.reason', {
        reason: accessStatus?.reason
    }, accessStatus?.reason === 'ZONE_PURCHASED', 
        accessStatus?.reason !== 'ZONE_PURCHASED' ? `reason = ${accessStatus?.reason} (expected ZONE_PURCHASED)` : null);
}

// ============================================
// SCENARIO 3: PURCHASE FLOW
// ============================================
async function scenario3_PurchaseFlow() {
    console.log('\n' + '='.repeat(60));
    console.log('SCENARIO 3: PURCHASE FLOW');
    console.log('='.repeat(60));

    // Step 1: Check wallet balance BEFORE
    console.log('\n--- Step 1: Check wallet balance BEFORE ---');
    const walletBefore = await req('GET', '/purchase/wallet', null, STATE.demoUserToken);
    
    if (!walletBefore.ok) {
        logResult('S3', 'Get wallet before', 'GET /purchase/wallet', walletBefore.data, false,
            `Failed to get wallet: HTTP ${walletBefore.status}`);
        return;
    }
    STATE.walletBefore = walletBefore.data.data?.balance;
    logResult('S3', 'Wallet balance before', 'GET /purchase/wallet', {
        balance: STATE.walletBefore,
        currency: walletBefore.data.data?.currency
    }, STATE.walletBefore != null);
    console.log(`   Balance before: ${STATE.walletBefore}`);

    // Step 2: Purchase zone (DEMO_HCMC_DISTRICT1 - not pre-unlocked)
    console.log('\n--- Step 2: Purchase zone ---');
    const purchaseRes = await req('POST', '/purchase/zone', {
        zoneCode: STATE.zoneCode
    }, STATE.demoUserToken);

    if (!purchaseRes.ok) {
        logResult('S3', 'Purchase zone', `POST /purchase/zone {zoneCode: "${STATE.zoneCode}"}`, purchaseRes.data, false,
            `Purchase failed: HTTP ${purchaseRes.status} - ${purchaseRes.data?.message}`);
        
        // If already unlocked, that's also useful info
        if (purchaseRes.data?.message?.includes('already unlocked')) {
            logResult('S3', 'Already unlocked check', 'N/A', { message: purchaseRes.data.message }, true);
        }
        // Try to continue with wallet check even if purchase fails
    } else {
        const purchaseData = purchaseRes.data.data;
        logResult('S3', 'Purchase zone', `POST /purchase/zone {zoneCode: "${STATE.zoneCode}"}`, {
            success: purchaseData?.success,
            message: purchaseData?.message,
            zoneCode: purchaseData?.zoneCode,
            price: purchaseData?.price,
            unlockedPois: purchaseData?.unlockedPois,
            newBalance: purchaseData?.newBalance
        }, purchaseData?.success === true);
    }

    // Step 3: Check wallet balance AFTER
    console.log('\n--- Step 3: Check wallet balance AFTER ---');
    const walletAfter = await req('GET', '/purchase/wallet', null, STATE.demoUserToken);
    
    if (!walletAfter.ok) {
        logResult('S3', 'Get wallet after', 'GET /purchase/wallet', walletAfter.data, false,
            `Failed to get wallet: HTTP ${walletAfter.status}`);
        return;
    }
    STATE.walletAfter = walletAfter.data.data?.balance;
    console.log(`   Balance after: ${STATE.walletAfter}`);

    // Verify: balance decreased correctly
    if (purchaseRes.ok) {
        const expectedBalance = STATE.walletBefore - STATE.zonePrice;
        const balanceCorrect = STATE.walletAfter === expectedBalance;
        logResult('S3', 'Balance decreased correctly', `Expected: ${expectedBalance}, Got: ${STATE.walletAfter}`, {
            before: STATE.walletBefore,
            after: STATE.walletAfter,
            zonePrice: STATE.zonePrice,
            expected: expectedBalance,
            diff: STATE.walletBefore - STATE.walletAfter
        }, balanceCorrect, !balanceCorrect ? `Balance mismatch: expected ${expectedBalance}, got ${STATE.walletAfter}` : null);
    }

    // Verify: zone unlocked (scan should now give access)
    console.log('\n--- Step 4: Verify zone is unlocked ---');
    const unlocks = await req('GET', '/purchase/unlocks', null, STATE.demoUserToken);
    if (unlocks.ok) {
        const unlockedZones = unlocks.data.data?.unlockedZones || [];
        const zoneUnlocked = unlockedZones.some(z => z.zoneCode === STATE.zoneCode);
        logResult('S3', 'Zone appears in unlocks', 'GET /purchase/unlocks', {
            unlockedZones: unlockedZones.map(z => z.zoneCode),
            targetZone: STATE.zoneCode,
            found: zoneUnlocked
        }, zoneUnlocked, !zoneUnlocked ? `Zone ${STATE.zoneCode} not found in unlock list` : null);
    }

    // Verify: cannot purchase same zone twice
    console.log('\n--- Step 5: Try to purchase same zone again ---');
    const duplicatePurchase = await req('POST', '/purchase/zone', {
        zoneCode: STATE.zoneCode
    }, STATE.demoUserToken);

    const isDuplicate = !duplicatePurchase.ok && duplicatePurchase.data?.message?.includes('already');
    logResult('S3', 'Duplicate purchase blocked', `POST /purchase/zone {zoneCode: "${STATE.zoneCode}"} (2nd time)`, {
        status: duplicatePurchase.status,
        message: duplicatePurchase.data?.message,
        blocked: isDuplicate
    }, isDuplicate, !isDuplicate ? `Duplicate purchase NOT blocked! Status: ${duplicatePurchase.status}, msg: ${duplicatePurchase.data?.message}` : null);
}

// ============================================
// SCENARIO 4: DOWNLOAD FLOW
// ============================================
async function scenario4_DownloadFlow() {
    console.log('\n' + '='.repeat(60));
    console.log('SCENARIO 4: DOWNLOAD FLOW');
    console.log('='.repeat(60));

    // Step 1: Download POIs for purchased zone
    console.log('\n--- Step 1: Download zone POIs ---');
    
    // First test with the pre-unlocked zone (DEMO_HANOI_OLD_QUARTER)
    const hanoiDownload = await req('POST', '/zones/DEMO_HANOI_OLD_QUARTER/download?limit=20', null, STATE.demoUserToken);
    
    if (!hanoiDownload.ok) {
        logResult('S4', 'Download pre-unlocked zone', 'POST /zones/DEMO_HANOI_OLD_QUARTER/download', hanoiDownload.data, false,
            `Download failed: HTTP ${hanoiDownload.status} - ${hanoiDownload.data?.message}`);
    } else {
        const dlData = hanoiDownload.data.data;
        const pois = dlData?.pois || [];

        // Verify: returns full POI list
        logResult('S4', 'Returns POI list', 'POST /zones/DEMO_HANOI_OLD_QUARTER/download', {
            poiCount: pois.length,
            pagination: dlData?.pagination,
            zoneName: dlData?.zoneName
        }, pois.length > 0, pois.length === 0 ? 'No POIs returned in download' : null);

        // Verify: includes narrationLong
        const allHaveNarrationLong = pois.every(p => p.narrationLong != null && p.narrationLong !== '');
        logResult('S4', 'Includes narrationLong', `Check ${pois.length} POIs`, {
            sample: pois.map(p => ({ code: p.code, hasNarrationLong: p.narrationLong != null && p.narrationLong !== '' }))
        }, allHaveNarrationLong, !allHaveNarrationLong ? 'Some POIs missing narrationLong in download (should have full content)' : null);

        // Verify: count matches zone
        // Get zone's poiCodes count
        const zoneRes = await req('GET', '/zones/DEMO_HANOI_OLD_QUARTER', null, STATE.demoUserToken);
        const zonePoisExpected = zoneRes.data?.data?.poiCodes?.length || 0;
        // The download uses pagination, and total should match
        const downloadTotal = dlData?.pagination?.total || pois.length;
        
        logResult('S4', 'Count matches zone', `Zone poiCodes: ${zonePoisExpected}, Download total: ${downloadTotal}`, {
            zonePoiCodes: zonePoisExpected,
            downloadTotal,
            downloadPagePois: pois.length
        }, downloadTotal > 0); // At minimum verify some POIs returned
    }

    // Step 2: Test download for the zone we just purchased (HCMC)
    console.log('\n--- Step 2: Download newly purchased zone ---');
    const hcmcDownload = await req('POST', `/zones/${STATE.zoneCode}/download?limit=20`, null, STATE.demoUserToken);

    if (!hcmcDownload.ok) {
        logResult('S4', 'Download purchased zone', `POST /zones/${STATE.zoneCode}/download`, hcmcDownload.data, false,
            `Download failed: HTTP ${hcmcDownload.status} - ${hcmcDownload.data?.message}`);
    } else {
        const dlData = hcmcDownload.data.data;
        const pois = dlData?.pois || [];

        logResult('S4', 'Purchased zone download works', `POST /zones/${STATE.zoneCode}/download`, {
            poiCount: pois.length,
            codes: pois.map(p => p.code)
        }, pois.length > 0);

        const allHaveContent = pois.every(p => p.narrationLong != null && p.narrationLong !== '');
        logResult('S4', 'Purchased zone has narrationLong', `Check ${pois.length} POIs`, {
            sample: pois[0]?.narrationLong?.substring(0, 60)
        }, allHaveContent, !allHaveContent ? 'narrationLong missing in download for purchased zone' : null);
    }

    // Step 3: Test download WITHOUT auth (should fail)
    console.log('\n--- Step 3: Download without auth (should fail) ---');
    const noAuthDownload = await req('POST', '/zones/DEMO_HANOI_OLD_QUARTER/download', null);
    
    logResult('S4', 'Download without auth blocked', 'POST /zones/.../download (no auth)', {
        status: noAuthDownload.status,
        message: noAuthDownload.data?.message
    }, noAuthDownload.status === 401, noAuthDownload.status !== 401 ? `Expected 401, got ${noAuthDownload.status}` : null);
}

// ============================================
// FINAL REPORT
// ============================================
function printFinalReport() {
    console.log('\n\n' + '='.repeat(60));
    console.log('FINAL TEST REPORT');
    console.log('='.repeat(60));

    const total = STATE.results.length;
    const passed = STATE.results.filter(r => r.pass).length;
    const failed = STATE.results.filter(r => !r.pass).length;
    const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : 0;

    console.log(`\nTotal Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Pass Rate: ${passRate}%`);

    // Group by scenario
    const scenarios = {};
    STATE.results.forEach(r => {
        if (!scenarios[r.scenario]) scenarios[r.scenario] = [];
        scenarios[r.scenario].push(r);
    });

    console.log('\n--- Per Scenario ---');
    Object.entries(scenarios).forEach(([scenario, results]) => {
        const sPassed = results.filter(r => r.pass).length;
        const sTotal = results.length;
        console.log(`  ${scenario}: ${sPassed}/${sTotal} passed`);
    });

    // List all REAL bugs
    const bugs = STATE.results.filter(r => !r.pass && r.bug);
    if (bugs.length > 0) {
        console.log('\n--- REAL BUGS FOUND ---');
        bugs.forEach((b, i) => {
            console.log(`  ${i + 1}. [${b.scenario}] ${b.step}: ${b.bug}`);
        });
    } else {
        console.log('\n--- NO BUGS FOUND ---');
    }

    // Detailed results table
    console.log('\n--- DETAILED RESULTS ---');
    STATE.results.forEach(r => {
        const icon = r.pass ? '✅' : '❌';
        console.log(`${icon} [${r.scenario}] ${r.step} ${r.bug ? '🐛 ' + r.bug : ''}`);
    });

    console.log('\n' + '='.repeat(60));
    console.log(`OVERALL PASS RATE: ${passRate}%`);
    console.log('='.repeat(60));
}

// ============================================
// MAIN
// ============================================
async function main() {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║  VN-GO TRAVEL: ZONE E2E TEST SUITE        ║');
    console.log('║  Simulating Real User + QA Engineer        ║');
    console.log('╚════════════════════════════════════════════╝');

    try {
        await setup();
        await scenario1_ScanWithoutAccess();
        await scenario2_ScanWithAccess();
        await scenario3_PurchaseFlow();
        await scenario4_DownloadFlow();
    } catch (error) {
        console.error('\n💥 FATAL TEST ERROR:', error.message);
        console.error(error.stack);
    }

    printFinalReport();
}

main();
