const BASE_URL = 'http://localhost:3000/api/v1';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function req(method, path, body = null, token = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE_URL}${path}`, opts);
    let data;
    try { data = await res.json(); } catch (e) { data = { error: e.message }; }
    return { status: res.status, data };
}

async function main() {
    console.log("Authenticating demo user...");
    const loginRes = await req('POST', '/auth/login', { email: 'demo@vngo.com', password: 'demo123' });
    const token = loginRes.data?.data?.token || loginRes.data?.token;
    
    // Check wallet before
    const w1 = await req('GET', '/purchase/wallet', null, token);
    const balanceBefore = w1.data?.data?.balance;
    console.log(`Balance before: ${balanceBefore}`);

    // TEST 1: Double purchase (Concurrent)
    console.log("--- 1. Double purchase (Concurrent) ---");
    const numRequests = 5;
    console.log(`Sending ${numRequests} concurrent purchase requests for DEMO_HCMC_DISTRICT1...`);
    
    const promises = [];
    for (let i = 0; i < numRequests; i++) {
        promises.push(req('POST', '/purchase/zone', { zoneCode: 'DEMO_HCMC_DISTRICT1' }, token));
    }
    
    const results = await Promise.all(promises);
    
    let successes = 0;
    let otherStatuses = [];
    
    results.forEach((r) => {
        if (r.status === 200 && r.data?.success) {
            successes++;
        } else {
            otherStatuses.push(r.status);
        }
    });
    
    console.log(`Successes: ${successes}`);
    console.log(`Other Statuses: ${otherStatuses.join(', ')}`);
    
    console.log("Sleeping 5 seconds to bypass rate limiter...");
    await sleep(5000);

    const w2 = await req('GET', '/purchase/wallet', null, token);
    const balanceAfter = w2.data?.data?.balance;
    console.log(`Balance after: ${balanceAfter}`);
    const deduction = balanceBefore - balanceAfter;
    console.log(`Total deduction: ${deduction}`);

    // TEST 2: Multi-device access
    console.log("--- 2. Multi-device access ---");
    // Get another token for the same user
    const loginRes2 = await req('POST', '/auth/login', { email: 'demo@vngo.com', password: 'demo123' });
    const token2 = loginRes2.data?.data?.token || loginRes2.data?.token;
    
    // Check unlocks with token2
    const unlocks = await req('GET', '/purchase/unlocks', null, token2);
    const unlockedZones = unlocks.data?.data?.unlockedZones || [];
    const hasZone = unlockedZones.some(z => z.zoneCode === 'DEMO_HCMC_DISTRICT1');
    console.log(`Zone 'DEMO_HCMC_DISTRICT1' found in session 2: ${hasZone}`);
}

main();
