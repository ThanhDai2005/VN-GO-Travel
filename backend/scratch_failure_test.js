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

async function main() {
    // 1. Invalid token
    console.log("--- 1. Invalid token ---");
    const r1 = await req('GET', '/purchase/wallet', null, 'invalid.token.here');
    console.log(`Status: ${r1.status}`);
    
    // 2. Expired token
    console.log("--- 2. Expired token ---");
    require('dotenv').config();
    const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET || 'super_secret_jwt_key_for_vngo_travel';
    const expiredToken = jwt.sign({ id: '123' }, secret, { expiresIn: '-1h' });
    const r2 = await req('GET', '/purchase/wallet', null, expiredToken);
    console.log(`Status: ${r2.status}`);

    const freshLogin = await req('POST', '/auth/login', { email: 'test@vngo.com', password: 'password123' });
    const freshToken = freshLogin.data?.data?.token || freshLogin.data?.token;

    // 3. Download without purchase
    console.log("--- 3. Download without purchase ---");
    const r3 = await req('POST', '/zones/DEMO_HCMC_DISTRICT1/download', null, freshToken);
    console.log(`Status: ${r3.status}`);

    // 4. Interrupted download
    console.log("--- 4. Interrupted download ---");
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10); 
    
    try {
        const opts = { method: 'POST', headers: { 'Authorization': `Bearer ${freshToken}` }, signal: controller.signal };
        await fetch(`${BASE_URL}/zones/DEMO_HCMC_DISTRICT1/download`, opts);
    } catch (e) {
        console.log(`Aborted successfully: ${e.name}`);
    }

    // Check if system is still usable
    const r4 = await req('GET', '/zones', null, freshToken);
    console.log(`System usable check Status: ${r4.status}`);
}

main();
