require('dotenv').config();
const mongoose = require('mongoose');
const Audio = require('../src/models/audio.model');
const config = require('../src/config');
const { spawn, execSync } = require('child_process');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const killProc = (child) => {
    try {
        execSync(`taskkill /F /PID ${child.pid} /T`);
    } catch(e) {}
};

async function runTests() {
    await mongoose.connect(config.mongoUri);
    const baseUrl1 = 'http://localhost:3000/api/v1/audio';

    console.log('\n--- TASK 2: RETRY AFTER RESTART ---');
    const failHash = "fail_retry_" + Date.now();
    await Audio.create({
        hash: failHash,
        text: "Fail test",
        normalizedText: "fail test",
        language: "vi",
        status: "failed",
        retryCount: 1,
        nextRetryAt: new Date(Date.now() - 5000) // 5s ago
    });
    
    const failDocBefore = await Audio.findOne({ hash: failHash });
    console.log(`DB Before Restart - Status: ${failDocBefore.status}, NextRetry: ${failDocBefore.nextRetryAt}`);
    
    console.log("Starting Server 3...");
    const server3 = spawn('node', ['src/server.js'], { env: { ...process.env, PORT: 3000 } });
    server3.stdout.on('data', (data) => console.log(`[Server 3] ${data.toString().trim()}`));
    server3.stderr.on('data', (data) => console.error(`[Server 3 ERROR] ${data.toString().trim()}`));
    
    console.log("Waiting 65s for worker to run...");
    await sleep(65000); 
    
    const failDocAfter = await Audio.findOne({ hash: failHash });
    console.log(`DB After Restart - Status: ${failDocAfter.status}`);
    
    if (failDocAfter.status === 'ready') {
        console.log('✅ PASS: Retry worker successfully recovered audio after restart');
    } else {
        console.log('❌ FAIL: Retry worker did not recover audio');
    }
    
    killProc(server3);
    await mongoose.disconnect();
}

runTests();
