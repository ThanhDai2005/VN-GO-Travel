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

async function testPartialDownload() {
    console.log('=== SCENARIO 2: PARTIAL DOWNLOAD CONSISTENCY ===\n');

    // Login
    const loginRes = await req('POST', '/auth/login', { email: 'test@vngo.com', password: 'password123' });
    const token = loginRes.data?.data?.token || loginRes.data?.token;

    const zoneCode = 'DEMO_HANOI_OLD_QUARTER';

    // First download
    const download1 = await req('POST', `/zones/${zoneCode}/download`, null, token);
    const pois1 = download1.data?.data?.pois || [];
    console.log('First download:', pois1.length, 'POIs');

    // Interrupt simulation (already tested in previous scenario)
    // Second download
    const download2 = await req('POST', `/zones/${zoneCode}/download`, null, token);
    const pois2 = download2.data?.data?.pois || [];
    console.log('Second download:', pois2.length, 'POIs');

    // Check for duplicates
    const codes1 = pois1.map(p => p.code);
    const codes2 = pois2.map(p => p.code);

    const hasDuplicates = codes1.length !== new Set(codes1).size || codes2.length !== new Set(codes2).size;
    const samePOIs = codes1.length === codes2.length && codes1.every(c => codes2.includes(c));

    console.log('\n=== VERIFICATION ===');
    console.log('First download POIs:', codes1);
    console.log('Second download POIs:', codes2);
    console.log('Has duplicates:', hasDuplicates ? 'YES' : 'NO');
    console.log('Same POIs returned:', samePOIs ? 'YES' : 'NO');

    if (!hasDuplicates && samePOIs && pois1.length > 0) {
        console.log('\n✔ PASS: No duplicates, consistent data');
    } else {
        console.log('\n❌ FAIL: Duplicate or inconsistent data');
    }
}

testPartialDownload().catch(err => {
    console.error('ERROR:', err.message);
    process.exit(1);
});
