# 🎯 AUDIO QUEUE SYSTEM - ARCHITECTURE PLAN

**Date:** 2026-04-23  
**Architect:** Senior Real-time Systems Engineer + Audio Streaming Architect  
**Objective:** Design per-user independent audio queue system

---

## 📊 CURRENT SYSTEM ANALYSIS

### ❌ PROBLEMS WITH CURRENT SYSTEM

**Architecture:** POI-centric (global queue per POI)

```
Current Flow:
User A enters POI_1 → Enqueue at POI_1 (position 0) → PLAYING
User B enters POI_1 → Enqueue at POI_1 (position 1) → QUEUED (waits)
User C enters POI_1 → Enqueue at POI_1 (position 2) → QUEUED (waits)
```

**Critical Issues:**
1. ❌ **Blocking:** User B must wait for User A to finish
2. ❌ **Shared queue:** All users at same POI share one queue
3. ❌ **No independence:** Users can't have their own audio experience
4. ❌ **Scalability:** 100 users at same POI = 99 users waiting

**Why this is wrong:**
- Audio is a **personal experience** (headphones/device speakers)
- Users don't interfere with each other's audio
- No physical reason to queue (unlike a physical tour guide)

---

## ✅ NEW SYSTEM DESIGN

### ARCHITECTURE: User-Centric (Independent Queue Per User)

```
New Flow:
User A enters POI_1 → User A's queue: [POI_1_audio] → PLAYING
User B enters POI_1 → User B's queue: [POI_1_audio] → PLAYING (independent)
User C enters POI_1 → User C's queue: [POI_1_audio] → PLAYING (independent)

User A enters POI_2 → User A's queue: [POI_1_audio, POI_2_audio] → QUEUED
```

**Key Principles:**
1. ✅ **Per-user queue:** Each user has their own FIFO queue
2. ✅ **No blocking:** Multiple users can play same POI audio simultaneously
3. ✅ **Independence:** User A's playback doesn't affect User B
4. ✅ **Scalability:** 100 users = 100 independent playback sessions

---

## 🧱 DATA STRUCTURE

### In-Memory State (Redis or Node.js Map)

```javascript
userAudioState = {
  "user_123": {
    currentAudioId: "audio_poi1_vi_short",
    queue: ["audio_poi2_vi_short", "audio_poi3_vi_short"],
    status: "playing",  // idle | loading | playing
    playbackState: {
      audioId: "audio_poi1_vi_short",
      poiCode: "POI_1",
      startedAt: 1713867730881,
      duration: 30,
      language: "vi",
      narrationLength: "short"
    },
    lastUpdated: 1713867730881,
    deviceId: "device_abc"
  },
  "user_456": {
    currentAudioId: "audio_poi1_vi_short",  // Same POI, different user
    queue: [],
    status: "playing",
    playbackState: { ... },
    lastUpdated: 1713867730882,
    deviceId: "device_xyz"
  }
}
```

### Persistent Storage (MongoDB)

```javascript
// audio_sessions collection
{
  _id: ObjectId,
  userId: ObjectId,
  deviceId: String,
  poiCode: String,
  audioId: String,
  language: String,
  narrationLength: String,
  status: "started" | "completed" | "interrupted" | "cancelled",
  startedAt: Date,
  completedAt: Date,
  duration: Number,  // actual playback duration
  queuePosition: Number,  // position in user's queue when started
  createdAt: Date
}
```

---

## 🔄 STATE MACHINE

### User Audio State Machine

```
┌─────────┐
│  IDLE   │ ← Initial state, no audio playing
└────┬────┘
     │ POI entry trigger
     ↓
┌─────────┐
│ LOADING │ ← Fetching audio asset (non-blocking)
└────┬────┘
     │ Audio ready
     ↓
┌─────────┐
│ PLAYING │ ← Audio actively playing
└────┬────┘
     │ Audio ends
     ↓
┌─────────┐
│  IDLE   │ ← Check queue, play next or stay idle
└─────────┘

Transitions:
- IDLE → LOADING: User enters POI, audio not in queue
- IDLE → PLAYING: User enters POI, audio already loaded
- LOADING → PLAYING: Audio asset loaded successfully
- LOADING → IDLE: Audio load failed
- PLAYING → IDLE: Audio completed, queue empty
- PLAYING → LOADING: Audio completed, next in queue
- PLAYING → PLAYING: Audio interrupted, start next immediately
- ANY → IDLE: User cancels, error occurs
```

---

## ⚡ QUEUE LOGIC

### Enqueue Rules

```javascript
function enqueueAudio(userId, poiCode, audioId) {
  const userState = getUserState(userId);
  
  // Rule 1: Same audio already playing → IGNORE
  if (userState.currentAudioId === audioId && userState.status === 'playing') {
    console.log('Same audio already playing, ignoring');
    return { action: 'ignored', reason: 'duplicate' };
  }
  
  // Rule 2: Same audio in queue → IGNORE
  if (userState.queue.includes(audioId)) {
    console.log('Audio already in queue, ignoring');
    return { action: 'ignored', reason: 'already_queued' };
  }
  
  // Rule 3: Queue full (max 5) → REJECT
  if (userState.queue.length >= MAX_QUEUE_LENGTH) {
    console.log('Queue full, rejecting');
    return { action: 'rejected', reason: 'queue_full' };
  }
  
  // Rule 4: User idle → PLAY IMMEDIATELY
  if (userState.status === 'idle') {
    userState.currentAudioId = audioId;
    userState.status = 'loading';
    startPlayback(userId, audioId);
    return { action: 'playing', position: 0 };
  }
  
  // Rule 5: User busy → ENQUEUE
  userState.queue.push(audioId);
  return { action: 'queued', position: userState.queue.length };
}
```

### Dequeue Logic

```javascript
function playNext(userId) {
  const userState = getUserState(userId);
  
  if (userState.queue.length === 0) {
    userState.status = 'idle';
    userState.currentAudioId = null;
    return null;
  }
  
  const nextAudioId = userState.queue.shift();  // FIFO
  userState.currentAudioId = nextAudioId;
  userState.status = 'loading';
  startPlayback(userId, nextAudioId);
  
  return nextAudioId;
}
```

---

## 🔥 CONCURRENCY STRATEGY

### Problem: Race Conditions

**Scenario:**
```
Time T0: User enters POI_1 → Enqueue request 1
Time T1: User enters POI_2 → Enqueue request 2 (before request 1 completes)
```

**Without protection:**
- Both requests read `status: 'idle'`
- Both try to play immediately
- Result: Audio overlap ❌

### Solution: Atomic Operations with Locks

**Option A: Redis Locks (Distributed)**
```javascript
async function enqueueWithLock(userId, audioId) {
  const lockKey = `audio_lock:${userId}`;
  const lock = await redis.set(lockKey, '1', 'NX', 'EX', 5);  // 5s TTL
  
  if (!lock) {
    // Another operation in progress, retry
    await sleep(100);
    return enqueueWithLock(userId, audioId);
  }
  
  try {
    // Critical section - atomic operation
    const userState = await getUserState(userId);
    const result = enqueueAudio(userId, audioId);
    await saveUserState(userId, userState);
    return result;
  } finally {
    await redis.del(lockKey);  // Release lock
  }
}
```

**Option B: In-Memory Locks (Single Server)**
```javascript
const userLocks = new Map();

async function enqueueWithLock(userId, audioId) {
  // Get or create lock for this user
  if (!userLocks.has(userId)) {
    userLocks.set(userId, Promise.resolve());
  }
  
  // Chain operations sequentially
  const previousOperation = userLocks.get(userId);
  const currentOperation = previousOperation.then(async () => {
    const userState = getUserState(userId);
    const result = enqueueAudio(userId, audioId);
    saveUserState(userId, userState);
    return result;
  });
  
  userLocks.set(userId, currentOperation);
  return currentOperation;
}
```

**Chosen Strategy:** Option B (In-Memory) for simplicity, Option A (Redis) for production scale

---

## 🚶 FAST MOVEMENT HANDLING

### Scenario: User walks quickly through multiple POIs

```
T0: User enters POI_1 → Audio_1 starts playing
T5: User enters POI_2 → Audio_1 still playing (25s remaining)
T10: User enters POI_3 → Audio_1 still playing (20s remaining)
```

### Strategy A: Queue All (Chosen)

**Behavior:**
- Audio_1 plays to completion
- Audio_2 plays next
- Audio_3 plays last

**Pros:**
- User hears all content
- No interruptions
- Smooth experience

**Cons:**
- Delayed feedback (user may have left POI_2 by the time Audio_2 plays)

**Implementation:**
```javascript
// Simply enqueue, let FIFO handle it
enqueue(userId, audio_2);
enqueue(userId, audio_3);
// Queue: [audio_2, audio_3]
```

### Strategy B: Interrupt Current (Alternative)

**Behavior:**
- Audio_1 interrupted when POI_2 entered
- Audio_2 starts immediately
- Audio_3 interrupts Audio_2

**Pros:**
- Immediate feedback
- Context-relevant audio

**Cons:**
- User never hears full content
- Jarring experience

**Implementation:**
```javascript
function enqueueWithInterrupt(userId, audioId, priority = 'normal') {
  const userState = getUserState(userId);
  
  if (priority === 'high') {
    // Stop current audio
    stopPlayback(userId);
    
    // Clear queue
    userState.queue = [];
    
    // Play new audio immediately
    startPlayback(userId, audioId);
  } else {
    // Normal enqueue
    enqueue(userId, audioId);
  }
}
```

**Decision:** Use **Strategy A (Queue All)** as default, with optional interrupt flag for special cases.

---

## 🔊 AUDIO STATE TRACKING

### Events to Track

1. **audio_start** - User starts playing audio
2. **audio_completed** - Audio played to end
3. **audio_interrupted** - Audio stopped before end (user moved, cancelled)
4. **audio_cancelled** - User explicitly cancelled

### Integration with Intelligence System

```javascript
async function trackAudioEvent(userId, deviceId, poiCode, audioId, eventType) {
  const event = {
    contractVersion: 'v2',
    deviceId,
    correlationId: `audio-${userId}-${Date.now()}`,
    authState: userId ? 'logged_in' : 'guest',
    sourceSystem: 'GAK',
    rbelEventFamily: 'user_interaction',
    rbelMappingVersion: '7.3.1',
    timestamp: new Date().toISOString(),
    userId: String(userId),
    poiId: poiCode,
    payload: {
      poi_id: poiCode,
      poi_code: poiCode,
      interaction_type: eventType,  // audio_start, audio_completed, etc.
      audio_id: audioId,
      audio_type: audioId.includes('long') ? 'long' : 'short',
      language: audioId.includes('_en_') ? 'en' : 'vi'
    }
  };
  
  await intelligenceEventsService.ingestSingle(event, null, { headerDeviceId: deviceId });
}
```

---

## 📡 OFFLINE SUPPORT

### Audio Asset Caching

```javascript
// Client-side (MAUI)
class AudioCacheService {
  async getAudio(audioId) {
    // Check local cache first
    const cached = await localCache.get(audioId);
    if (cached) {
      console.log('Audio loaded from cache');
      return cached;
    }
    
    // Download from server (non-blocking)
    console.log('Downloading audio...');
    const audio = await downloadAudio(audioId);
    
    // Cache for future use
    await localCache.set(audioId, audio);
    
    return audio;
  }
}

// Backend API
GET /api/v1/audio/asset/:audioId
Response: Audio file (MP3/OGG) with cache headers
```

### Preloading Strategy

```javascript
// Preload audio for nearby POIs
async function preloadNearbyAudio(userLocation, radius = 500) {
  const nearbyPois = await findPoisWithinRadius(userLocation, radius);
  
  for (const poi of nearbyPois) {
    const audioId = getAudioId(poi.code, userLanguage, 'short');
    
    // Download in background (non-blocking)
    downloadAudio(audioId).catch(err => {
      console.log(`Failed to preload ${audioId}:`, err);
    });
  }
}
```

---

## 🧪 TESTING STRATEGY

### Test 1: Single User, Multiple POIs

```javascript
// User enters 3 POIs in quick succession
await enqueue(user1, poi1_audio);  // Plays immediately
await enqueue(user1, poi2_audio);  // Queued (position 1)
await enqueue(user1, poi3_audio);  // Queued (position 2)

// Verify queue
assert(user1.queue.length === 2);
assert(user1.currentAudioId === poi1_audio);
```

### Test 2: Multiple Users, Same POI

```javascript
// 50 users enter same POI simultaneously
const promises = [];
for (let i = 0; i < 50; i++) {
  promises.push(enqueue(`user_${i}`, poi1_audio));
}

await Promise.all(promises);

// Verify: All 50 users playing independently
for (let i = 0; i < 50; i++) {
  const state = getUserState(`user_${i}`);
  assert(state.status === 'playing');
  assert(state.currentAudioId === poi1_audio);
}
```

### Test 3: Concurrency Safety

```javascript
// Same user, 2 simultaneous enqueue requests
const [result1, result2] = await Promise.all([
  enqueue(user1, poi1_audio),
  enqueue(user1, poi2_audio)
]);

// Verify: No race condition
// One should play, one should queue
assert(
  (result1.action === 'playing' && result2.action === 'queued') ||
  (result1.action === 'queued' && result2.action === 'playing')
);
```

### Test 4: Fast Movement

```javascript
// User enters 5 POIs in 10 seconds
for (let i = 1; i <= 5; i++) {
  await enqueue(user1, `poi${i}_audio`);
  await sleep(2000);  // 2s between POIs
}

// Verify: All 5 in queue or playing
const state = getUserState(user1);
assert(state.queue.length + (state.currentAudioId ? 1 : 0) === 5);
```

---

## 📊 PERFORMANCE TARGETS

| Metric | Target | Rationale |
|--------|--------|-----------|
| Enqueue latency | < 50ms | User shouldn't notice delay |
| Playback start | < 200ms | Acceptable for audio start |
| Concurrent users | 100+ | Typical POI visitor count |
| Queue operations/sec | 1000+ | High-traffic scenarios |
| Memory per user | < 1KB | 100 users = 100KB total |

---

## 🚀 IMPLEMENTATION PLAN

### Phase 1: Core Service (2-3 hours)
1. Create `UserAudioQueueService` class
2. Implement in-memory state management
3. Implement enqueue/dequeue logic
4. Add concurrency locks

### Phase 2: API Layer (1-2 hours)
1. Create REST endpoints
2. Add WebSocket support (real-time updates)
3. Integrate with authentication

### Phase 3: Persistence (1 hour)
1. Create `audio_sessions` collection
2. Implement tracking events
3. Add cleanup job

### Phase 4: Testing (2 hours)
1. Unit tests (queue logic)
2. Integration tests (API)
3. Load tests (concurrency)

### Phase 5: Client Integration (3-4 hours)
1. Update MAUI client
2. Implement audio caching
3. Add preloading

**Total Estimated Time:** 9-12 hours

---

## ✅ SUCCESS CRITERIA

1. ✅ Each user has independent audio queue
2. ✅ No audio overlap for same user
3. ✅ Multiple users can play same POI audio simultaneously
4. ✅ System handles 100+ concurrent users
5. ✅ Enqueue latency < 50ms
6. ✅ No race conditions under concurrent load
7. ✅ Audio state tracked in analytics
8. ✅ Offline support with caching

---

**Plan Status:** ✅ APPROVED  
**Next Step:** Implementation

---

**END OF PLAN**
