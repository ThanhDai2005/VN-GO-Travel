require('dotenv').config();
const axios = require('axios');
const mongoose = require('mongoose');
const Audio = require('../src/models/audio.model');
const config = require('../src/config');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const killProc = (child) => {
    try {
        execSync(`taskkill /F /PID ${child.pid} /T`);
    } catch(e) {}
};

async function runTests() {
    console.log("=========================================");
    console.log("=== STRICT PRODUCTION RE-VALIDATION ===");
    console.log("=========================================\n");
    
    await mongoose.connect(config.mongoUri);
    // Cleanup DB and storage for clean test
    await mongoose.connection.db.collection('audios').deleteMany({});
    const storageDir = path.join(process.cwd(), 'storage', 'audio');
    if (fs.existsSync(storageDir)) {
        for (const file of fs.readdirSync(storageDir)) {
            if (file.endsWith('.mp3')) fs.unlinkSync(path.join(storageDir, file));
        }
    }

    // Start Server Instance 1
    console.log("[SETUP] Starting Server 1 on port 3000...");
    let server1 = spawn('node', ['src/server.js'], { env: { ...process.env, PORT: 3000 } });
    await sleep(5000); // Wait for boot
    const baseUrl1 = 'http://localhost:3000/api/v1/audio';

    try {
        // --- TASK 1: Fix Rate Limit Test ---
        console.log('\n--- TASK 1: RATE LIMIT TEST (30 requests) ---');
        const rlPromises = [];
        for (let i = 0; i < 30; i++) {
            rlPromises.push(axios.post(`${baseUrl1}/generate`, { text: `Rate limit test ${i}`, language: "vi" }, { validateStatus: () => true }));
        }
        const rlResults = await Promise.all(rlPromises);
        const allowedCount = rlResults.filter(r => r.status === 200).length;
        const blockedCount = rlResults.filter(r => r.status === 429).length;
        console.log(`Allowed requests (200): ${allowedCount}`);
        console.log(`Blocked requests (429): ${blockedCount}`);
        if (allowedCount === 20 && blockedCount === 10) {
            console.log('✅ PASS: Rate limit exactly 20 allowed, 10 blocked');
        } else {
            console.log('❌ FAIL: Rate limit counts mismatch');
        }

        // --- TASK 3: Harden Orphan Cleanup ---
        console.log('\n--- TASK 3: ORPHAN CLEANUP ---');
        const oldFile = path.join(storageDir, 'old_orphan.mp3');
        const recentFile = path.join(storageDir, 'recent_orphan.mp3');
        fs.writeFileSync(oldFile, 'fake data');
        fs.writeFileSync(recentFile, 'fake data');
        
        // Modify oldFile time to 15 mins ago
        const oldTime = Date.now() - (15 * 60 * 1000);
        fs.utimesSync(oldFile, new Date(oldTime), new Date(oldTime));

        await axios.post(`${baseUrl1}/cleanup`);
        
        const oldExists = fs.existsSync(oldFile);
        const recentExists = fs.existsSync(recentFile);
        
        console.log(`Old file exists: ${oldExists} (expected false)`);
        console.log(`Recent file exists: ${recentExists} (expected true)`);
        if (!oldExists && recentExists) {
            console.log('✅ PASS: Orphan cleanup logic verified');
        } else {
            console.log('❌ FAIL: Orphan cleanup failed');
        }

        // --- TASK 4: Generation Backpressure ---
        console.log('\n--- TASK 4: GENERATION BACKPRESSURE ---');
        const bpText = "Backpressure test " + Date.now();
        let maxActiveSeen = 0;
        server1.stdout.on('data', (data) => {
            const out = data.toString();
            const match = out.match(/\[Active: (\d+)\]/);
            if (match) {
                const active = parseInt(match[1]);
                if (active > maxActiveSeen) maxActiveSeen = active;
            }
        });

        const bpPromises = [];
        for (let i = 0; i < 10; i++) {
            bpPromises.push(axios.post(`${baseUrl1}/generate`, { text: bpText, language: "en" }, { validateStatus: () => true }));
        }
        await Promise.all(bpPromises);
        console.log(`Max active generations seen: ${maxActiveSeen}`);
        if (maxActiveSeen === 3) {
            console.log('✅ PASS: Backpressure limited to 3 active');
        } else {
            console.log('❌ FAIL: Backpressure incorrect or log missed');
        }

        // --- TASK 5: True Distributed Lock ---
        console.log('\n--- TASK 5: TRUE DISTRIBUTED LOCK ---');
        console.log("[SETUP] Restarting Server 1 to clear rate limits...");
        killProc(server1);
        await sleep(2000);
        server1 = spawn('node', ['src/server.js'], { env: { ...process.env, PORT: 3000 } });
        await sleep(5000);

        console.log("[SETUP] Starting Server 2 on port 3001...");
        const server2 = spawn('node', ['src/server.js'], { env: { ...process.env, PORT: 3001 } });
        await sleep(5000);
        const baseUrl2 = 'http://localhost:3001/api/v1/audio';

        const lockText = "Distributed lock " + Date.now();
        const lockPromises = [
            axios.post(`${baseUrl1}/generate`, { text: lockText, language: "ja" }),
            axios.post(`${baseUrl2}/generate`, { text: lockText, language: "ja" })
        ];
        
        await Promise.all(lockPromises);
        const lockDocs = await Audio.find({ text: lockText });
        console.log(`Total DB records for lock text: ${lockDocs.length}`);
        if (lockDocs.length === 1 && lockDocs[0].status === 'ready') {
            console.log('✅ PASS: Only 1 generation occurred across instances');
        } else {
            console.log('❌ FAIL: Distributed lock failed');
        }
        killProc(server2);

        // --- TASK 6: Analytics Validation ---
        console.log('\n--- TASK 6: ANALYTICS VALIDATION ---');
        const playHash = lockDocs[0].hash;
        for (let i = 0; i < 10; i++) {
            await axios.post(`${baseUrl1}/play`, { hash: playHash });
        }
        const analyticsRes = await axios.get(`${baseUrl1}/analytics`);
        const langStats = analyticsRes.data.data.langStats;
        const jaStat = langStats.find(s => s._id === 'ja');
        console.log(`PlayCount for JA language: ${jaStat ? jaStat.totalPlays : 0}`);
        if (jaStat && jaStat.totalPlays >= 10) {
            console.log('✅ PASS: Analytics accurately tracks plays');
        } else {
            console.log('❌ FAIL: Analytics tracking incorrect');
        }

        // --- TASK 2: Verify Retry After Server Restart ---
        console.log('\n--- TASK 2: RETRY AFTER RESTART ---');
        const audioService = require('../src/services/audio.service');
        const failText = "Fail test " + Date.now();
        const failHash = audioService.getHash(failText, 'vi', 'female', 1);
        
        await Audio.create({
            hash: failHash,
            text: failText,
            normalizedText: failText.toLowerCase(),
            language: "vi",
            status: "failed",
            retryCount: 1,
            nextRetryAt: new Date(Date.now() - 60000) // 60s ago
        });
        
        const failDocBefore = await Audio.findOne({ hash: failHash });
        console.log(`DB Before Restart - Status: ${failDocBefore.status}, NextRetry: ${failDocBefore.nextRetryAt}`);
        
        console.log("Killing Server 1...");
        killProc(server1);
        await sleep(2000);
        
        console.log("Starting Server 1 again...");
        const server3 = spawn('node', ['src/server.js'], { env: { ...process.env, PORT: 3000 } });
        server3.stdout.on('data', (data) => console.log(`[Server 3] ${data.toString().trim()}`));
        server3.stderr.on('data', (data) => console.error(`[Server 3 ERROR] ${data.toString().trim()}`));
        
        console.log("Waiting 90s for worker to run and finish...");
        await sleep(90000); 
        
        const failDocAfter = await Audio.findOne({ hash: failHash });
        console.log(`DB After Restart - Status: ${failDocAfter.status}`);
        
        if (failDocAfter.status === 'ready') {
            console.log('✅ PASS: Retry worker successfully recovered audio after restart');
        } else {
            console.log('❌ FAIL: Retry worker did not recover audio');
        }
        
        killProc(server3);

    } catch (err) {
        console.error("Test execution failed:", err);
        killProc(server1);
    }

    await mongoose.disconnect();
    console.log('\n=== END OF RE-VALIDATION ===');
}

runTests();
