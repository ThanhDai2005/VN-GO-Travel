# PRODUCTION OFFLINE SYSTEM - DOCUMENTATION

## Overview

Production-ready offline-first system with persistent storage, queue management, retry logic, and audio support.

## Key Upgrades from Prototype

### 1. Persistent Storage (IndexedDB)

**Before:** In-memory Map (lost on restart)

**After:** IndexedDB with 3 object stores:
- `pois` - POI data with audio metadata
- `queue` - Download queue state
- `audio` - Audio blobs

**Benefits:**
- Survives page reload
- Survives app restart
- Mobile-ready (compatible with SQLite interface)

---

### 2. Persistent Download Queue

**Before:** In-memory queue (lost on restart)

**After:** Queue state saved to IndexedDB

**State Saved:**
```javascript
{
  queue: Array<POI>,        // Pending downloads
  completed: Set<poiCode>,  // Completed POIs
  failed: Map<poiCode, retryCount>,
  processing: boolean
}
```

**Auto-Resume:**
- On app start, queue automatically restores state
- Continues unfinished downloads
- Skips completed POIs

---

### 3. Retry Logic

**Implementation:**
- Max 3 retries per POI
- 2-second delay between retries
- Tracks retry count per POI

**Flow:**
```
Download POI
  ↓
Attempt 1 → FAIL
  ↓
Wait 2s
  ↓
Attempt 2 → FAIL
  ↓
Wait 2s
  ↓
Attempt 3 → SUCCESS
  ↓
Mark completed
```

**Failure Handling:**
- After 3 failures, POI removed from queue
- Could be moved to failed queue (optional)

---

### 4. Audio Download Support

**POI Structure Extended:**
```javascript
{
  code: string,
  name: string,
  narrationShort: string,
  narrationLong: string,
  narrationAudioUrl: string,    // NEW
  localAudioPath: string,        // NEW
  location: object,
  downloadedAt: timestamp
}
```

**Audio Flow:**
```
Download POI
  ↓
IF narrationAudioUrl exists:
  ↓
  Fetch audio file
  ↓
  Store as Blob in IndexedDB
  ↓
  Update POI.localAudioPath
```

**Storage:**
- Audio stored as Blob in separate object store
- Linked to POI via poiCode
- Retrieved on demand

---

### 5. Updated Access Layer

**Offline-First Logic:**

```javascript
getPoiContent(poiCode)
  ↓
IF exists in local storage:
  ✔ Return full content (narrationLong)
  ✔ Return audio blob (if available)
ELSE:
  ✔ Return restricted (narrationShort only)
  ✔ No audio
```

**Response Structure:**
```javascript
{
  source: 'local' | 'online',
  hasFullContent: boolean,
  hasAudio: boolean,
  poi: {
    code: string,
    name: string,
    narrationShort: string,
    narrationLong: string | null,
    location: object,
    audioBlob: Blob | null
  }
}
```

---

## API Reference

### PersistentStorage

```javascript
const storage = new PersistentStorage('vngo_offline', 1);
await storage.init();

// Store POI (prevents duplication)
await storage.storePoi(poi);

// Get POI
const poi = await storage.getPoi(poiCode);

// Check existence
const exists = await storage.hasPoi(poiCode);

// Store audio
await storage.storeAudio(poiCode, audioBlob);

// Get audio
const audioBlob = await storage.getAudio(poiCode);

// Update audio path
await storage.updatePoiAudio(poiCode, localPath);
```

### PersistentDownloadQueue

```javascript
const queue = new PersistentDownloadQueue(storage);
await queue.init(); // Auto-resumes unfinished downloads

// Download zone
const result = await queue.downloadZone(zoneCode, apiClient);
// Returns: { total, added, skipped }

// Interrupt
await queue.interrupt();

// Resume
await queue.resume();

// Get status
const status = queue.getStatus();
// Returns: { pending, completed, failed, processing }
```

### ProductionOfflineAccessLayer

```javascript
const access = new ProductionOfflineAccessLayer(storage);

// Get POI content (offline-first)
const content = await access.getPoiContent(poiCode, onlinePoi);

// Check full content availability
const hasFull = await access.hasFullContent(poiCode);

// Check audio availability
const hasAudio = await access.hasAudio(poiCode);
```

---

## Validation Results

### ✔ Test 1: Persistent Storage & Queue Resume
- Download 5 POIs
- Simulate app restart
- Queue auto-resumes
- All 5 POIs still available
- **PASS**

### ✔ Test 2: Retry Logic
- Simulate network failures
- Retry 3 times with 2s delay
- Success on 3rd attempt
- **PASS**

### ✔ Test 3: Audio Support
- Download POI with audio URL
- Audio stored as Blob
- Audio retrieved correctly
- **PASS**

### ✔ Test 4: Offline-First Access
- Local POI: full content + audio
- Online POI: restricted (narrationShort only)
- **PASS**

### ✔ Test 5: No Duplication
- Re-download same zone
- All POIs skipped (already downloaded)
- No duplicate entries
- **PASS**

---

## Production Deployment

### Web (Browser)

```javascript
// IndexedDB available natively
const storage = new PersistentStorage('vngo_offline', 1);
await storage.init();

const queue = new PersistentDownloadQueue(storage);
await queue.init(); // Auto-resumes on page load

const access = new ProductionOfflineAccessLayer(storage);
```

### Mobile (React Native / Flutter)

Replace IndexedDB with SQLite:

```javascript
class SQLiteStorage extends PersistentStorage {
  async init() {
    // Open SQLite database
    this.db = await SQLite.openDatabase('vngo_offline.db');
    
    // Create tables
    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS pois (
        code TEXT PRIMARY KEY,
        data TEXT,
        downloadedAt TEXT
      )
    `);
  }
  
  async storePoi(poi) {
    const exists = await this.hasPoi(poi.code);
    if (exists) return false;
    
    await this.db.executeSql(
      'INSERT INTO pois (code, data, downloadedAt) VALUES (?, ?, ?)',
      [poi.code, JSON.stringify(poi), new Date().toISOString()]
    );
    return true;
  }
  
  // Implement other methods...
}
```

---

## Success Criteria

✅ **Survives app restart** - Queue and storage persist

✅ **Resumes downloads correctly** - Auto-resume on init

✅ **Avoids duplication** - Checks before storing

✅ **Supports audio offline** - Audio stored and retrieved

✅ **Deterministic and testable** - All tests pass

---

## System Status

**PRODUCTION-READY** ✅

All critical requirements met:
- Persistent storage implemented
- Queue survives restart
- Retry logic working
- Audio support complete
- No duplication
- Offline-first access correct

Ready for integration into mobile/web apps.
