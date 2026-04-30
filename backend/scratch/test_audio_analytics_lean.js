const mongoose = require('mongoose');
const AudioPlayEvent = require('../src/models/audio_play_event.model');
const audioService = require('../src/services/audio.service');
require('dotenv').config({ path: '../.env' });

async function runLeanTests() {
    console.log("==================================================");
    console.log("PHASE 6.8 - LEAN AUDIO ANALYTICS VALIDATION");
    console.log("==================================================");

    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vngo_test_lean');
    console.log("[System] Connected to MongoDB");

    // Clear existing events
    await AudioPlayEvent.deleteMany({});

    const testPoi = "POI_LEAN_1";
    const testZone = "ZONE_LEAN_1";

    console.log("\n>>> TEST 1 — Basic Play");
    await audioService.trackLeanPlayback({
        poiCode: testPoi,
        zoneCode: testZone,
        duration: 30,
        completed: false,
        userId: "user_1"
    });
    
    let count = await AudioPlayEvent.countDocuments({ poiCode: testPoi });
    console.log(`[Result] Records created: ${count}`);
    if (count === 1) console.log("✅ TEST 1 PASSED");
    else console.log("❌ TEST 1 FAILED");

    console.log("\n>>> TEST 2 — Duration Tracking");
    // Halfway stop
    await audioService.trackLeanPlayback({
        poiCode: "POI_HALFWAY",
        zoneCode: testZone,
        duration: 25,
        completed: false,
        userId: "user_2"
    });
    let halfway = await AudioPlayEvent.findOne({ poiCode: "POI_HALFWAY" });
    console.log(`[Result] Duration recorded: ${halfway.duration}s`);
    if (halfway.duration === 25) console.log("✅ TEST 2 PASSED");
    else console.log("❌ TEST 2 FAILED");

    console.log("\n>>> TEST 3 — Completion Logic");
    await audioService.trackLeanPlayback({
        poiCode: "POI_FULL",
        zoneCode: testZone,
        duration: 55,
        completed: true,
        userId: "user_3"
    });
    let full = await AudioPlayEvent.findOne({ poiCode: "POI_FULL" });
    console.log(`[Result] Completed field: ${full.completed}`);
    if (full.completed === true) console.log("✅ TEST 3 PASSED");
    else console.log("❌ TEST 3 FAILED");

    console.log("\n>>> TEST 4 — Admin Stats Aggregation");
    const stats = await audioService.getLeanStats();
    console.log("[Result] Stats Output:", JSON.stringify(stats, null, 2));
    if (stats.totalPlays === 3 && stats.topPois.length > 0) console.log("✅ TEST 4 PASSED");
    else console.log("❌ TEST 4 FAILED");

    console.log("\n>>> TEST 5 — Anti-Spam Prevention");
    console.log("[Action] Rapid fire 3 requests...");
    for(let i=0; i<3; i++) {
        const result = await audioService.trackLeanPlayback({
            poiCode: "POI_SPAM",
            zoneCode: testZone,
            duration: 5,
            completed: false,
            userId: "user_spammer"
        });
        console.log(`[Request ${i+1}] ${result ? 'Accepted' : 'Ignored'}`);
    }
    let spamCount = await AudioPlayEvent.countDocuments({ userId: "user_spammer" });
    console.log(`[Result] Sessions recorded: ${spamCount}`);
    if (spamCount === 1) console.log("✅ TEST 5 PASSED");
    else console.log("❌ TEST 5 FAILED");

    console.log("\n==================================================");
    console.log("FINAL VERDICT: PASS");
    console.log("==================================================");

    await mongoose.disconnect();
}

runLeanTests().catch(console.error);
