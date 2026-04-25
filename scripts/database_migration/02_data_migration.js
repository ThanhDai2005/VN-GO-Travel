/**
 * 02_data_migration.js
 * 
 * This Node.js script reads the legacy MongoDB JSON dumps and outputs
 * the new normalized collections as per the target architecture.
 * 
 * Usage: node 02_data_migration.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const inputDir = path.join(__dirname, '..', '..', 'backend', 'mongo');
const outputDir = path.join(__dirname, '..', '..', 'backend', 'mongo', 'migrated');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log("Starting data migration...");

// Helper: read json safely
function readJson(filename) {
  try {
    const filePath = path.join(inputDir, filename);
    if (!fs.existsSync(filePath)) return [];
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error(`Error reading ${filename}:`, err.message);
    return [];
  }
}

// Generate new Object ID (simulated for scripts)
function generateObjectId() {
  return { "$oid": crypto.randomBytes(12).toString('hex') };
}

// 1. Process POIs -> pois, poi_contents, audio_assets
const oldPois = readJson('vngo_travel.pois.json');

const newPois = [];
const poiContents = [];
const audioAssets = [];
const processedCodes = new Set();

oldPois.forEach(oldPoi => {
  // Deduplicate by code
  if (processedCodes.has(oldPoi.code)) {
    console.warn(`Duplicate POI code found and skipped: ${oldPoi.code}`);
    return;
  }
  processedCodes.add(oldPoi.code);

  const poiId = oldPoi._id;
  const langCode = oldPoi.languageCode || 'vi';

  // Core POI Document
  newPois.push({
    _id: poiId,
    code: oldPoi.code,
    location: oldPoi.location,
    radius: oldPoi.radius,
    priority: oldPoi.priority,
    isActive: oldPoi.status === 'APPROVED',
    createdAt: oldPoi.createdAt,
    updatedAt: oldPoi.updatedAt
  });

  // POI Content Document
  poiContents.push({
    _id: generateObjectId(),
    poiId: poiId,
    languageCode: langCode,
    name: oldPoi.name,
    summary: oldPoi.summary,
    description: oldPoi.content || null,
    version: 1,
    updatedAt: oldPoi.updatedAt
  });

  // Audio Assets Document (Short)
  if (oldPoi.narrationShort) {
    audioAssets.push({
      _id: generateObjectId(),
      poiId: poiId,
      languageCode: langCode,
      type: "short",
      voice: "default",
      fileUrl: null, // to be updated when audio is actually generated
      duration: 0,
      fileSize: 0,
      checksum: null,
      version: 1,
      createdAt: oldPoi.createdAt
    });
  }

  // Audio Assets Document (Long)
  if (oldPoi.narrationLong) {
    audioAssets.push({
      _id: generateObjectId(),
      poiId: poiId,
      languageCode: langCode,
      type: "long",
      voice: "default",
      fileUrl: null, // to be updated
      duration: 0,
      fileSize: 0,
      checksum: null,
      version: 1,
      createdAt: oldPoi.createdAt
    });
  }
});

fs.writeFileSync(path.join(outputDir, 'pois.json'), JSON.stringify(newPois, null, 2));
fs.writeFileSync(path.join(outputDir, 'poi_contents.json'), JSON.stringify(poiContents, null, 2));
fs.writeFileSync(path.join(outputDir, 'audio_assets.json'), JSON.stringify(audioAssets, null, 2));

console.log(`Migrated ${newPois.length} POIs into 'pois', 'poi_contents', and 'audio_assets'.`);


// 2. Process Users -> remove legacy counters, initialize users
const oldUsers = readJson('vngo_travel.users.json');
const newUsers = [];

oldUsers.forEach(oldUser => {
  newUsers.push({
    _id: oldUser._id,
    email: oldUser.email,
    role: oldUser.role,
    isPremium: oldUser.isPremium,
    createdAt: oldUser.createdAt || oldUser.updatedAt
  });
});

fs.writeFileSync(path.join(outputDir, 'users.json'), JSON.stringify(newUsers, null, 2));
console.log(`Migrated ${newUsers.length} Users.`);


// 3. Process Events -> user_poi_events
const oldEvents = readJson('vngo_travel.uis_events_raw.audio_heatmap_samples.json');
const newEvents = [];

oldEvents.forEach(evt => {
  if (!evt.payload || !evt.payload.poiCode) return;

  let poiCode = evt.payload.poiCode.replace(/^POI_/, '');
  let poiId = null;

  // Find corresponding poiId
  const foundPoi = newPois.find(p => p.code === poiCode);
  if (foundPoi) {
    poiId = foundPoi._id;
  } else {
    // Fallback if POI was not found
    poiId = generateObjectId();
  }

  let eventType = "enter";
  if (evt.payload.routeOrAction === "audio_play_short" || evt.payload.routeOrAction === "audio_play_long") {
      eventType = "audio_start";
  } else if (evt.payload.routeOrAction === "qr_scan") {
      eventType = "qr_scan";
  }

  newEvents.push({
    _id: generateObjectId(),
    userId: evt.user_id || null,
    poiId: poiId,
    eventType: eventType,
    duration: evt.payload.duration || 0,
    deviceId: evt.device_id,
    createdAt: evt.timestamp
  });
});

fs.writeFileSync(path.join(outputDir, 'user_poi_events.json'), JSON.stringify(newEvents, null, 2));
console.log(`Migrated ${newEvents.length} POI Events.`);

console.log("Data migration complete. Check the 'migrated' folder.");
