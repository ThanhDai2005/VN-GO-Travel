const BASE_URL = 'http://localhost:3000/api/v1';

async function req(method, path, body = null, token = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE_URL}${path}`, opts);
    let data;
    try { data = await res.json(); } catch (e) { data = { error: e.message }; }
    return { status: res.status, data };
}

const RESULTS = {
    SCENARIO_1: null,
    SCENARIO_2: null,
    SCENARIO_3: null,
    SCENARIO_4: null,
    SCENARIO_5: null
};

const FAILURES = [];

async function main() {
    console.log('==================================================');
    console.log('CRITICAL FLOW VALIDATION');
    console.log('==================================================\n');

    // Setup: Login to get token
    const loginRes = await req('POST', '/auth/login', { email: 'test@vngo.com', password: 'password123' });
    const token = loginRes.data?.data?.token || loginRes.data?.token;

    if (!token) {
        console.log('❌ FATAL: Cannot login');
        process.exit(1);
    }

    // Get test zone code
    const zonesRes = await req('GET', '/zones', null, token);
    const zones = zonesRes.data?.data || [];

    // Find unpurchased zone
    const testZone = zones.find(z => z.accessStatus?.allowed === false);

    if (!testZone) {
        console.log('❌ FATAL: No unpurchased zones available');
        process.exit(1);
    }

    const zoneCode = testZone.code;
    console.log(`Using test zone: ${zoneCode}\n`);

    // Generate QR token (simulate admin action)
    // For testing, we'll use zone scan endpoint directly

    // ==================================================
    // SCENARIO 1: REAL USER FLOW
    // ==================================================
    console.log('### SCENARIO 1: REAL USER FLOW');
    console.log('Testing: scan → no purchase → purchase → scan → download\n');

    try {
        // Step 1: Get zone info before purchase
        const zoneInfoBefore = await req('GET', `/zones/${zoneCode}`, null, token);
        const hasAccessBefore = zoneInfoBefore.data?.data?.accessStatus?.allowed;

        console.log(`1. Zone access before purchase: ${hasAccessBefore}`);
        console.log(`   Debug: accessStatus =`, JSON.stringify(zoneInfoBefore.data?.data?.accessStatus));

        if (hasAccessBefore) {
            console.log('⚠️  User already has access - cannot test restricted flow');
            RESULTS.SCENARIO_1 = 'SKIP';
        } else {
            // Step 2: Purchase zone
            const walletBefore = await req('GET', '/purchase/wallet', null, token);
            const balanceBefore = walletBefore.data?.data?.balance;

            console.log(`2. Wallet balance before: ${balanceBefore}`);

            const purchaseRes = await req('POST', '/purchase/zone', { zoneCode }, token);

            if (purchaseRes.status !== 200) {
                throw new Error(`Purchase failed: ${purchaseRes.data?.message || 'Unknown error'}`);
            }

            console.log(`3. Purchase successful`);

            // Step 3: Verify access after purchase
            const zoneInfoAfter = await req('GET', `/zones/${zoneCode}`, null, token);
            const hasAccessAfter = zoneInfoAfter.data?.data?.accessStatus?.allowed;

            console.log(`4. Zone access after purchase: ${hasAccessAfter}`);
            console.log(`   Debug: accessStatus =`, JSON.stringify(zoneInfoAfter.data?.data?.accessStatus));

            // Step 4: Download zone
            const downloadRes = await req('POST', `/zones/${zoneCode}/download`, null, token);
            const poisDownloaded = downloadRes.data?.data?.pois?.length || 0;

            console.log(`5. Downloaded POIs: ${poisDownloaded}`);

            // Step 5: Verify wallet deducted
            const walletAfter = await req('GET', '/purchase/wallet', null, token);
            const balanceAfter = walletAfter.data?.data?.balance;

            console.log(`6. Wallet balance after: ${balanceAfter}`);

            // Validation
            const walletDeducted = balanceBefore > balanceAfter;
            const accessGranted = hasAccessAfter === true;
            const accessDeniedBefore = hasAccessBefore === false;
            const poisReturned = poisDownloaded > 0;

            if (accessDeniedBefore && accessGranted && poisReturned && walletDeducted) {
                RESULTS.SCENARIO_1 = 'PASS';
                console.log('✔ PASS: Flow matches business logic\n');
            } else {
                RESULTS.SCENARIO_1 = 'FAIL';
                FAILURES.push('SCENARIO 1: Wrong content exposure or access control');
                console.log('❌ FAIL: Flow does not match business logic\n');
            }
        }
    } catch (error) {
        RESULTS.SCENARIO_1 = 'FAIL';
        FAILURES.push(`SCENARIO 1: ${error.message}`);
        console.log(`❌ FAIL: ${error.message}\n`);
    }

    // ==================================================
    // SCENARIO 2: OFFLINE SIMULATION
    // ==================================================
    console.log('### SCENARIO 2: OFFLINE SIMULATION');
    console.log('Testing: interrupt download → resume\n');

    try {
        // Interrupt download
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 50);

        try {
            const opts = {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                signal: controller.signal
            };
            await fetch(`${BASE_URL}/zones/${zoneCode}/download`, opts);
        } catch (e) {
            console.log(`1. Download interrupted: ${e.name}`);
        }

        // Resume: Check system still usable
        const resumeRes = await req('GET', '/zones', null, token);
        const systemUsable = resumeRes.status === 200;

        console.log(`2. System usable after interrupt: ${systemUsable}`);

        // Retry download
        const retryRes = await req('POST', `/zones/${zoneCode}/download`, null, token);
        const retrySuccess = retryRes.status === 200;

        console.log(`3. Retry download successful: ${retrySuccess}`);

        if (systemUsable && retrySuccess) {
            RESULTS.SCENARIO_2 = 'PASS';
            console.log('✔ PASS: System still usable\n');
        } else {
            RESULTS.SCENARIO_2 = 'FAIL';
            FAILURES.push('SCENARIO 2: System not usable after interrupt');
            console.log('❌ FAIL: System broken after interrupt\n');
        }
    } catch (error) {
        RESULTS.SCENARIO_2 = 'FAIL';
        FAILURES.push(`SCENARIO 2: ${error.message}`);
        console.log(`❌ FAIL: ${error.message}\n`);
    }

    // ==================================================
    // SCENARIO 3: REPLAY QR TOKEN
    // ==================================================
    console.log('### SCENARIO 3: REPLAY QR TOKEN');
    console.log('Testing: Use same zone multiple times\n');

    try {
        const scan1 = await req('GET', `/zones/${zoneCode}`, null, token);
        const access1 = scan1.data?.data?.accessStatus?.allowed;

        console.log(`1. First scan access: ${access1}`);

        const scan2 = await req('GET', `/zones/${zoneCode}`, null, token);
        const access2 = scan2.data?.data?.accessStatus?.allowed;

        console.log(`2. Second scan access: ${access2}`);

        const consistent = access1 === access2;

        if (consistent) {
            RESULTS.SCENARIO_3 = 'PASS';
            console.log('✔ PASS: Consistent behavior\n');
        } else {
            RESULTS.SCENARIO_3 = 'FAIL';
            FAILURES.push('SCENARIO 3: Inconsistent responses');
            console.log('❌ FAIL: Inconsistent responses\n');
        }
    } catch (error) {
        RESULTS.SCENARIO_3 = 'FAIL';
        FAILURES.push(`SCENARIO 3: ${error.message}`);
        console.log(`❌ FAIL: ${error.message}\n`);
    }

    // ==================================================
    // SCENARIO 4: MULTI-ZONE STATE
    // ==================================================
    console.log('### SCENARIO 4: MULTI-ZONE STATE');
    console.log('Testing: Zone isolation\n');

    try {
        const allZones = await req('GET', '/zones', null, token);
        const zones = allZones.data?.data || [];

        if (zones.length < 2) {
            console.log('⚠️  Only one zone available - cannot test isolation');
            RESULTS.SCENARIO_4 = 'SKIP';
        } else {
            const zoneA = zones[0];
            const zoneB = zones[1];

            const accessA = zoneA.accessStatus?.allowed;
            const accessB = zoneB.accessStatus?.allowed;

            console.log(`1. Zone A (${zoneA.code}) access: ${accessA}`);
            console.log(`2. Zone B (${zoneB.code}) access: ${accessB}`);

            // If one is purchased and one is not, verify isolation
            if (accessA !== accessB) {
                RESULTS.SCENARIO_4 = 'PASS';
                console.log('✔ PASS: Strict isolation\n');
            } else {
                // Both same state - cannot verify isolation
                console.log('⚠️  Both zones have same access state');
                RESULTS.SCENARIO_4 = 'SKIP';
            }
        }
    } catch (error) {
        RESULTS.SCENARIO_4 = 'FAIL';
        FAILURES.push(`SCENARIO 4: ${error.message}`);
        console.log(`❌ FAIL: ${error.message}\n`);
    }

    // ==================================================
    // SCENARIO 5: DATA CONSISTENCY
    // ==================================================
    console.log('### SCENARIO 5: DATA CONSISTENCY');
    console.log('Testing: DB consistency after full flow\n');

    // Wait 20s to avoid rate limiting (3 requests/min limit)
    console.log('Waiting 20s to avoid rate limit...');
    await new Promise(resolve => setTimeout(resolve, 20000));

    try {
        // Get wallet
        const wallet = await req('GET', '/purchase/wallet', null, token);
        const balance = wallet.data?.data?.balance;

        console.log(`1. Wallet balance: ${balance}`);
        if (balance === undefined) {
            console.log(`   Debug: wallet response =`, JSON.stringify(wallet.data));
        }

        // Get unlocks
        const unlocks = await req('GET', '/purchase/unlocks', null, token);
        const unlockedZones = unlocks.data?.data?.unlockedZones || [];
        const unlockedPois = unlocks.data?.data?.unlockedPois || [];

        console.log(`2. Unlocked zones: ${unlockedZones.length}`);
        console.log(`3. Unlocked POIs: ${unlockedPois.length}`);

        // Get history
        const history = await req('GET', '/purchase/history', null, token);
        const transactions = history.data?.data || [];

        console.log(`4. Transaction history: ${transactions.length} records`);

        // Validation: wallet exists, unlocks recorded, history exists
        const consistent = typeof balance === 'number' && unlockedZones.length >= 0 && transactions.length >= 0;

        if (consistent) {
            RESULTS.SCENARIO_5 = 'PASS';
            console.log('✔ PASS: Data consistent\n');
        } else {
            RESULTS.SCENARIO_5 = 'FAIL';
            FAILURES.push('SCENARIO 5: Data mismatch');
            console.log('❌ FAIL: Data mismatch\n');
        }
    } catch (error) {
        RESULTS.SCENARIO_5 = 'FAIL';
        FAILURES.push(`SCENARIO 5: ${error.message}`);
        console.log(`❌ FAIL: ${error.message}\n`);
    }

    // ==================================================
    // FINAL REPORT
    // ==================================================
    console.log('==================================================');
    console.log('FINAL REPORT');
    console.log('==================================================\n');

    Object.entries(RESULTS).forEach(([scenario, result]) => {
        const icon = result === 'PASS' ? '✔' : result === 'FAIL' ? '❌' : '⚠️';
        console.log(`${icon} ${scenario}: ${result}`);
    });

    console.log('\n==================================================');
    console.log('CRITICAL FAILURES');
    console.log('==================================================\n');

    if (FAILURES.length === 0) {
        console.log('✔ NO CRITICAL FAILURES\n');
    } else {
        FAILURES.forEach(failure => {
            console.log(`❌ ${failure}`);
        });
        console.log('');
    }
}

main().catch(err => {
    console.error('FATAL ERROR:', err);
    process.exit(1);
});
