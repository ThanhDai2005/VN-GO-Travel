# AUDIO SYSTEM AUDIT

**Audit Date:** 2026-05-05  
**Auditor:** Senior System Architect + QA Auditor  
**Scope:** Full system analysis - Database, Backend, Web Bridge, Mobile App, Audio System, Analytics

---

## 1. System Overview

The VN-GO-Travel6 system is a location-based audio tour application with the following architecture:

- **Database:** MongoDB (POIs, Zones, Audio, Users, Analytics)
- **Backend:** Node.js/Express API (REST endpoints)
- **Web Bridge:** Public zone landing pages (QR scan entry point)
- **Mobile App:** .NET MAUI/Xamarin (iOS/Android)
- **Audio System:** Google TTS with distributed generation and caching
- **Analytics:** Event tracking for audio playback and user behavior

**Primary Flow:**
```
QR Code Scan → Web Bridge → Deep Link → Mobile App → Zone POI List → POI Detail → Audio Playback
```

---

## 2. Data Flow Trace

### 2.1 QR Scan Flow (Zone-Based)

**Step 1: QR Code Generation (Admin)**
- **Input:** Zone ID
- **Process:** `zoneService.generateZoneQrToken(zoneId)`
- **Output:** JWT token with `{ jti, zoneId, zoneCode, type: 'zone_qr', exp }`
- **URL Format:** `${config.scanQrUrlBase}?t=${token}`
- **Potential Issues:**
  - ✅ Token expiration handled
  - ✅ Token revocation supported
  - ⚠️ `config.scanQrUrlBase` must point to web bridge (not verified in config)

**Step 2: Web Bridge (Public Zone Landing)**
- **Endpoint:** `GET /api/v1/public/zones/:zoneCode`
- **Controller:** `public.zone.controller.js`
- **Input:** `zoneCode` from URL parameter
- **Process:**
  ```javascript
  Zone.findOne({ code: zoneCode.toUpperCase(), isActive: true })
  Poi.find({ code: { $in: limitedPoiCodes }, status: 'APPROVED' })
  ```
- **Output:**
  ```json
  {
    "zoneCode": "ZONE01",
    "name": "Zone Name",
    "thumbnail": "zone.imageUrl",
    "totalPois": 10,
    "pois": [
      {
        "poiCode": "POI01",
        "name": "POI Name",
        "thumbnail": "p.imageUrl",
        "shortDescription": "p.summary"
      }
    ]
  }
  ```
- **CRITICAL ISSUES:**
  - ❌ **POI model does NOT have `imageUrl` field** (line 48: `thumbnail: p.imageUrl || null`)
  - ❌ Returns only **first 6 POIs** (line 26: `zone.poiCodes.slice(0, 6)`)
  - ⚠️ No audio information returned at this stage
  - ⚠️ No deep link generation in response

**Step 3: Deep Link Trigger**
- **Expected:** Web bridge should generate deep link to mobile app
- **Format:** `vngo://zone?zoneCode=ZONE01&zoneName=...&lang=vi`
- **CRITICAL ISSUE:**
  - ❌ **Web bridge controller does NOT generate or return deep link**
  - ❌ No HTML page found that handles QR scan and triggers deep link
  - ❌ Missing web bridge HTML/JavaScript implementation

**Step 4: Mobile App Deep Link Handler**
- **Handler:** `PoiEntryCoordinator.HandleSecureScanAsync()`
- **Input:** JWT token from QR scan
- **API Call:** `POST /api/v1/zones/scan` with `{ token }`
- **Backend Process:** `zoneService.resolveZoneScanToken()`
- **Output:**
  ```json
  {
    "zone": { "code", "name", "description", "price", "poiCount" },
    "pois": [
      {
        "code", "name", "summary", "narrationShort", "narrationLong",
        "location": { "lat", "lng" },
        "audio": { "url", "ready" },
        "audioUrl": "/storage/audio/{hash}.mp3"
      }
    ],
    "accessStatus": { "hasAccess", "requiresPurchase", "price" }
  }
  ```
- **Potential Issues:**
  - ✅ Audio status checked via `audioService.getAudioStatus()`
  - ✅ Background audio generation triggered if not ready
  - ⚠️ Error handling: catches audio errors but continues (line 192-196)

**Step 5: Mobile Zone POI List Page**
- **Page:** `ZonePoisPage.xaml.cs`
- **API Call:** `GET /api/v1/zones/{zoneCode}` (line 98)
- **Backend Endpoint:** `zone.controller.js` → `getZoneByCode()`
- **CRITICAL ISSUES:**
  - ❌ **API endpoint mismatch:**
    - Mobile calls: `GET zones/{zoneCode}`
    - Backend expects: `GET zones/:code` (zone.controller.js line 56)
    - Backend returns: `{ success: true, data: zoneObj }`
    - **zoneObj does NOT contain `poiCodes` array by default**
  - ❌ **Mobile expects `Data.PoiCodes` array** (line 120-124)
  - ❌ **Backend `Zone.toObject()` does NOT include POI details, only metadata**
  - ❌ **Mobile filters local POIs by `zonePoiCodes`** but this array is likely empty/missing

**Step 6: POI Detail Page**
- **Navigation:** User taps POI from list
- **Route:** `/poidetail?code={poiCode}&lang={lang}`
- **Expected:** POI detail page with audio player
- **Potential Issues:**
  - ⚠️ Audio URL must be available from previous zone scan
  - ⚠️ If POI not in local DB, detail page will fail

---

### 2.2 Audio Generation Flow (Phase 6.1-6.9)

**Step 1: Audio Status Check**
- **Function:** `audioService.getAudioStatus(text, language, voice, version, poiCode)`
- **Input:** Text content, language, voice, version, poiCode
- **Process:**
  ```javascript
  hash = SHA1(normalizedText + language + voice + version)
  audio = Audio.findOne({ hash })
  if (audio.status === 'ready' && file exists) return { url, ready: true }
  else return { url, ready: false, status }
  ```
- **Output:** `{ url, ready, hash, status }`
- **Issues:**
  - ✅ Version-aware hashing
  - ✅ File existence check
  - ⚠️ Returns URL even if not ready (client must check `ready` flag)

**Step 2: Audio Generation (Async)**
- **Function:** `audioService.generateAudio()`
- **Concurrency Control:** Max 3 concurrent generations (line 18)
- **Lock Mechanism:** Atomic upsert with `requestId` in `error` field (line 86-104)
- **Process:**
  1. Atomic upsert to acquire lock
  2. Check if already ready or being generated
  3. Generate via Google TTS API
  4. Concatenate audio chunks
  5. Write to file system
  6. Update status to 'ready'
- **Retry Logic:**
  - Max 3 retries (line 17)
  - Exponential backoff: 5s, 30s, 120s (line 190)
  - Persistent retry state in DB
- **Issues:**
  - ✅ Robust lock mechanism
  - ✅ Stale job detection (2 minutes timeout)
  - ⚠️ Google TTS API failures not logged with details
  - ⚠️ No monitoring for generation queue depth

**Step 3: Audio Delivery**
- **URL Format:** `/storage/audio/{hash}.mp3`
- **Serving:** Express static middleware (app.js line 99)
- **Issues:**
  - ✅ Direct file serving
  - ⚠️ No CDN integration
  - ⚠️ No cache headers configured

---

## 3. Database Issues

### 3.1 Schema Mismatches

**Issue 1: POI Model Missing `imageUrl` Field**
- **Location:** `backend/src/models/poi.model.js`
- **Impact:** Public zone controller returns `null` for POI thumbnails
- **Severity:** MEDIUM
- **Evidence:** Line 48 in `public.zone.controller.js` references `p.imageUrl` but POI schema has no such field

**Issue 2: Zone Model Does Not Expose POI Details**
- **Location:** `backend/src/models/zone.model.js`
- **Impact:** Mobile app cannot get POI list from zone endpoint
- **Severity:** HIGH
- **Evidence:** 
  - Zone schema only has `poiCodes: [String]` (line 38-40)
  - Mobile expects full POI objects with location, name, etc.
  - `zone.toObject()` returns only zone metadata, not POI details

### 3.2 Data Consistency

**Issue 3: POI Status Filtering**
- **Location:** Multiple services
- **Impact:** Inconsistent filtering of APPROVED vs PENDING POIs
- **Severity:** LOW
- **Evidence:**
  - `zone.service.js` filters by `POI_STATUS.APPROVED` (line 140)
  - `public.zone.controller.js` filters by `status: 'APPROVED'` (line 30)
  - Consistent behavior observed

**Issue 4: Audio Hash Collisions**
- **Location:** `audio.service.js`
- **Impact:** Different POIs with same text/language/version share audio
- **Severity:** LOW (by design)
- **Evidence:** Hash includes text+language+voice+version but NOT poiCode (line 54-58)

---

## 4. Backend Issues

### 4.1 API Endpoint Mismatches

**Issue 1: Zone Endpoint Returns Incomplete Data**
- **Location:** `backend/src/controllers/zone.controller.js`
- **Endpoint:** `GET /api/v1/zones/:code`
- **Expected by Mobile:** `{ success: true, data: { code, name, description, poiCodes: [...], accessStatus } }`
- **Actually Returns:** `{ success: true, data: zoneObj }` where `zoneObj = zone.toObject()`
- **Problem:** `zone.toObject()` includes `poiCodes` array but NOT POI details (location, name, etc.)
- **Severity:** CRITICAL
- **Impact:** Mobile app cannot display POI list because it needs full POI objects, not just codes

**Issue 2: Public Zone Endpoint Limits POIs**
- **Location:** `backend/src/controllers/public.zone.controller.js`
- **Endpoint:** `GET /api/v1/public/zones/:zoneCode`
- **Behavior:** Returns only first 6 POIs (line 26)
- **Severity:** MEDIUM
- **Impact:** Web bridge shows incomplete zone preview

**Issue 3: Zone Scan Endpoint vs Zone Detail Endpoint**
- **Location:** Two different endpoints serve zone data
- **Endpoints:**
  - `POST /api/v1/zones/scan` (with JWT token) → Returns full POI details with audio
  - `GET /api/v1/zones/:code` → Returns zone metadata only
- **Problem:** Mobile uses wrong endpoint for zone POI list
- **Severity:** CRITICAL

### 4.2 Audio System Issues

**Issue 4: Audio URL Format Inconsistency**
- **Location:** `zone.service.js` lines 176-181
- **Problem:** Returns both `audio: { url, ready }` AND `audioUrl` (legacy)
- **Severity:** LOW
- **Impact:** Redundant data, potential confusion

**Issue 5: Audio Generation Error Handling**
- **Location:** `zone.service.js` lines 192-196
- **Problem:** Audio generation errors are caught and logged but don't fail the zone scan
- **Behavior:** Returns `audio: { ready: false }` on error
- **Severity:** LOW (acceptable fallback)

**Issue 6: Audio Status Check Race Condition**
- **Location:** `audio.service.js` lines 60-72
- **Problem:** File existence check happens after DB check
- **Scenario:** If file deleted but DB says 'ready', returns `ready: true` with missing file
- **Severity:** MEDIUM
- **Impact:** 404 errors on audio playback

---

## 5. Mobile Issues (CRITICAL)

### 5.1 ZonePoisPage Data Loading

**Issue 1: Wrong API Endpoint Used**
- **Location:** `Views/ZonePoisPage.xaml.cs` line 98
- **Code:** `await _apiService.GetAsync($"zones/{zoneCode}")`
- **Expected Response:** Zone with POI details
- **Actual Response:** Zone metadata with `poiCodes` array (strings only)
- **Severity:** CRITICAL
- **Impact:** **POI list will be empty because mobile filters local DB by `zonePoiCodes` but has no POI details from API**

**Issue 2: Data Mapping Mismatch**
- **Location:** `ZonePoisPage.xaml.cs` lines 116-124
- **Code:**
  ```csharp
  var zoneData = JsonSerializer.Deserialize<ZoneAccessResponse>(json, ...);
  var zonePoiCodes = zoneData?.Data?.PoiCodes?
      .Where(c => !string.IsNullOrWhiteSpace(c))
      .Select(c => c.Trim().ToUpperInvariant())
      .ToList() ?? new List<string>();
  ```
- **Problem:** `ZoneAccessData` class expects `List<string> PoiCodes` (line 312)
- **Backend Returns:** `poiCodes: ["POI01", "POI02", ...]` (array of strings)
- **Severity:** HIGH
- **Impact:** Mobile gets POI codes but no location/name data to display

**Issue 3: Local Database Dependency**
- **Location:** `ZonePoisPage.xaml.cs` lines 128-134
- **Code:**
  ```csharp
  await _poiQuery.InitAsync();
  var allPois = await _poiQuery.GetAllAsync();
  var poisToShow = zonePoiCodes.Count > 0
      ? allPois.Where(p => zonePoiCodes.Contains(p.Code, ...)).ToList()
      : new List<Poi>();
  ```
- **Problem:** Relies on local SQLite database to have POI details
- **Scenario:** If user scans QR for new zone, local DB won't have POIs yet
- **Severity:** CRITICAL
- **Impact:** **Empty POI list even though zone exists**

**Issue 4: Missing POI Ingestion from Zone Endpoint**
- **Location:** `ZonePoisPage.xaml.cs`
- **Problem:** Page does NOT call zone scan endpoint (`POST /api/v1/zones/scan`)
- **Expected Flow:** 
  1. QR scan → Deep link → `PoiEntryCoordinator.HandleSecureScanAsync()`
  2. Coordinator calls `POST zones/scan` → Gets POIs with audio
  3. Coordinator calls `MergeZoneScanResultIntoLocalAsync()` → Saves POIs to local DB
  4. Navigate to `ZonePoisPage`
- **Actual Flow:**
  1. QR scan → ??? (web bridge missing)
  2. User manually navigates to zone → `ZonePoisPage` calls `GET zones/{code}`
  3. Gets only POI codes, no details
  4. Local DB empty → Empty list
- **Severity:** CRITICAL

### 5.2 Audio System Integration

**Issue 5: No Audio Data in Zone POI List**
- **Location:** `ZonePoisPage.xaml.cs`
- **Problem:** POI list items don't include audio URLs
- **Impact:** User must navigate to detail page to get audio
- **Severity:** LOW (acceptable UX)

**Issue 6: Audio Prefetch Not Triggered**
- **Location:** `PoiEntryCoordinator.cs` line 146
- **Code:** `_ = Task.Run(() => _audioPrefetch.PrefetchZoneAudioAsync(data.Pois ?? new List<ZonePoiData>()));`
- **Problem:** Only triggered during zone scan flow, not when loading zone POI list
- **Severity:** MEDIUM
- **Impact:** Slower audio playback on first POI visit

---

## 6. Audio System Issues

### 6.1 Audio Generation

**Issue 1: Google TTS API Dependency**
- **Location:** `audio.service.js` lines 142-157
- **Problem:** Single point of failure
- **Severity:** HIGH
- **Impact:** If Google TTS is down/rate-limited, all audio generation fails

**Issue 2: No Audio Generation Monitoring**
- **Location:** `audio.service.js`
- **Problem:** No metrics for:
  - Generation queue depth
  - Average generation time
  - Failure rate
- **Severity:** MEDIUM
- **Impact:** Cannot detect audio system degradation

**Issue 3: Stale Job Timeout Too Short**
- **Location:** `audio.service.js` line 15
- **Value:** `STALE_TIMEOUT_MS = 120000` (2 minutes)
- **Problem:** Long text generation may exceed 2 minutes
- **Severity:** LOW
- **Impact:** Rare false-positive stale job detection

### 6.2 Audio Storage

**Issue 4: No Storage Quota Management**
- **Location:** `audio.service.js` lines 420-442
- **Behavior:** Deletes old files when count > 5000
- **Problem:** No disk space monitoring
- **Severity:** MEDIUM
- **Impact:** Disk full errors possible

**Issue 5: Orphan File Cleanup Race Condition**
- **Location:** `audio.service.js` lines 349-375
- **Problem:** 10-minute safety window may not be enough during high load
- **Severity:** LOW

### 6.3 Audio Delivery

**Issue 6: No CDN Integration**
- **Location:** `app.js` line 99
- **Problem:** Audio served directly from Node.js
- **Severity:** MEDIUM
- **Impact:** High bandwidth usage, slower delivery

**Issue 7: No Cache Headers**
- **Location:** `app.js` line 99
- **Problem:** Static middleware has no cache configuration
- **Severity:** MEDIUM
- **Impact:** Repeated downloads of same audio files

---

## 7. Analytics Issues

### 7.1 Audio Playback Tracking

**Issue 1: Duplicate Event Prevention**
- **Location:** `audio.service.js` lines 220-230, 281-291
- **Behavior:** 10-second window to prevent spam
- **Problem:** Legitimate replays within 10s are ignored
- **Severity:** LOW
- **Impact:** Slight undercount of playback events

**Issue 2: Duration Validation**
- **Location:** `audio.service.js` lines 268-278
- **Behavior:** Clamps duration to 3600s max
- **Problem:** No validation for negative durations (line 269 checks `<= 0`)
- **Severity:** LOW
- **Impact:** Invalid events rejected correctly

### 7.2 Event Tracking

**Issue 3: No Event Batching**
- **Location:** Mobile app event tracking
- **Problem:** Each event sent individually
- **Severity:** LOW
- **Impact:** Higher network overhead

---

## 8. Root Causes (IMPORTANT)

### Root Cause 1: API Endpoint Design Mismatch
**Problem:** Mobile app uses wrong endpoint for zone POI list
- **Mobile expects:** `GET /api/v1/zones/{code}` to return full POI details
- **Backend provides:** Only zone metadata with POI codes
- **Correct endpoint:** `POST /api/v1/zones/scan` (requires JWT token)
- **Impact:** Empty POI list in mobile app

### Root Cause 2: Missing Web Bridge Implementation
**Problem:** No HTML page to handle QR scan and trigger deep link
- **Expected:** QR scan → Web page → Deep link to mobile app
- **Actual:** Public API endpoint exists but no web page
- **Impact:** QR scan flow broken

### Root Cause 3: Incomplete Zone Scan Flow
**Problem:** Mobile app bypasses zone scan endpoint
- **Expected:** QR scan → Zone scan API → POI ingestion → Zone POI list
- **Actual:** Direct navigation to zone POI list → No POI data
- **Impact:** User sees empty zone

### Root Cause 4: Local Database Dependency
**Problem:** Mobile app relies on local DB for POI details
- **Design:** POIs should be fetched from API and cached locally
- **Reality:** Local DB empty for new zones
- **Impact:** Cannot display POIs without prior zone scan

### Root Cause 5: Audio URL Returned Before Generation
**Problem:** Backend returns audio URL with `ready: false`
- **Design:** Client should poll or wait for audio generation
- **Reality:** Client may attempt to play audio before ready
- **Impact:** 404 errors or silent failures

---

## 9. Risk Level

### HIGH RISK
1. **Zone POI List Empty** - Mobile app cannot display POIs for zones
2. **Missing Web Bridge** - QR scan flow broken
3. **API Endpoint Mismatch** - Wrong endpoint used by mobile app
4. **Audio File 404 Errors** - Race condition between DB status and file existence

### MEDIUM RISK
1. **POI Thumbnail Missing** - Public zone endpoint returns null thumbnails
2. **No Audio CDN** - High bandwidth usage, slow delivery
3. **No Audio Monitoring** - Cannot detect system degradation
4. **Storage Quota** - Disk full errors possible

### LOW RISK
1. **Audio URL Redundancy** - Both `audio.url` and `audioUrl` returned
2. **Analytics Undercount** - 10s duplicate prevention may skip legitimate events
3. **Stale Job Timeout** - Rare false positives for long text generation

---

## 10. Fix Priority Order

### Priority 1: CRITICAL - Fix Mobile Zone POI List (MUST FIX FIRST)
**Problem:** Mobile app cannot display POIs because it uses wrong endpoint
**Solution Options:**
1. **Option A (Recommended):** Modify mobile app to use zone scan endpoint
   - Change `ZonePoisPage.xaml.cs` line 98 to call `POST /api/v1/zones/scan`
   - Requires JWT token from QR scan
   - Returns full POI details with audio
2. **Option B:** Modify backend zone endpoint to return POI details
   - Change `zone.controller.js` to populate POI details
   - Add `pois` array with full POI objects
   - Maintain backward compatibility
3. **Option C:** Create new endpoint `GET /api/v1/zones/:code/pois`
   - Returns POI details for zone
   - Mobile calls this after getting zone metadata

**Recommended:** Option B - Modify backend to return POI details in zone endpoint

### Priority 2: CRITICAL - Implement Web Bridge
**Problem:** No HTML page to handle QR scan and trigger deep link
**Solution:**
1. Create HTML page at `${config.scanQrUrlBase}`
2. Parse JWT token from URL query parameter
3. Display zone preview (call `GET /api/v1/public/zones/:zoneCode`)
4. Generate deep link: `vngo://zone?token={jwt}`
5. Trigger deep link on button click or auto-redirect

### Priority 3: HIGH - Fix Audio File 404 Race Condition
**Problem:** DB says 'ready' but file doesn't exist
**Solution:**
1. Modify `audioService.getAudioStatus()` to check file existence FIRST
2. If file missing but DB says 'ready', update DB to 'failed'
3. Trigger regeneration

### Priority 4: MEDIUM - Add POI Thumbnail Field
**Problem:** POI model missing `imageUrl` field
**Solution:**
1. Add `imageUrl: { type: String, default: null }` to POI schema
2. Update POI creation/update endpoints to accept `imageUrl`
3. Migrate existing POIs to add default thumbnail

### Priority 5: MEDIUM - Add Audio CDN
**Problem:** Audio served directly from Node.js
**Solution:**
1. Configure CDN (CloudFlare, AWS CloudFront, etc.)
2. Update audio URL generation to use CDN domain
3. Add cache headers to static middleware

### Priority 6: MEDIUM - Add Audio System Monitoring
**Problem:** No metrics for audio generation
**Solution:**
1. Add Prometheus metrics or custom logging
2. Track: queue depth, generation time, failure rate
3. Set up alerts for degradation

### Priority 7: LOW - Remove Audio URL Redundancy
**Problem:** Both `audio.url` and `audioUrl` returned
**Solution:**
1. Deprecate `audioUrl` field
2. Update mobile app to use `audio.url`
3. Remove `audioUrl` after migration period

### Priority 8: LOW - Optimize Analytics
**Problem:** No event batching
**Solution:**
1. Implement client-side event batching
2. Send events in batches of 10 or every 30 seconds
3. Reduce network overhead

---

## 11. Additional Observations

### Positive Findings
1. ✅ Audio generation has robust lock mechanism
2. ✅ Retry logic with exponential backoff
3. ✅ Version-aware audio caching
4. ✅ Access control properly implemented
5. ✅ Analytics anti-spam protection

### Architecture Strengths
1. Clean separation of concerns (services, controllers, repositories)
2. Comprehensive error handling in backend
3. Async audio generation doesn't block requests
4. Zone-based access control well-designed

### Architecture Weaknesses
1. Mobile app too dependent on local database
2. No API versioning strategy
3. No API documentation (OpenAPI/Swagger)
4. No integration tests for critical flows
5. No end-to-end testing for QR scan flow

---

## 12. Testing Recommendations

### Critical Tests Needed
1. **Zone POI List Flow**
   - Test: Scan QR → Navigate to zone → Verify POI list displayed
   - Expected: POI list with names, summaries, locations
   - Current: Empty list

2. **Audio Playback Flow**
   - Test: Open POI detail → Play audio
   - Expected: Audio plays immediately or shows loading
   - Current: May fail with 404 if audio not ready

3. **Web Bridge Flow**
   - Test: Scan QR with camera → Web page opens → Deep link triggers
   - Expected: Mobile app opens to zone POI list
   - Current: Web bridge missing

### Integration Tests Needed
1. Zone scan endpoint returns valid POI data
2. Audio generation completes within timeout
3. Audio file exists after status = 'ready'
4. Mobile app can parse zone scan response
5. Deep link triggers correct navigation

---

## 13. Conclusion

The audio system has a **CRITICAL BROKEN FLOW** in the mobile app's zone POI list feature. The root cause is an API endpoint mismatch where the mobile app calls `GET /api/v1/zones/{code}` expecting full POI details, but the backend only returns POI codes.

**The system will NOT work for users scanning QR codes** because:
1. Web bridge HTML page is missing
2. Mobile app uses wrong API endpoint
3. POI list will be empty
4. Audio cannot be played without POI details

**Immediate action required:**
1. Fix mobile app to use correct endpoint OR modify backend endpoint to return POI details
2. Implement web bridge HTML page
3. Test end-to-end QR scan flow

**System is NOT production-ready** until Priority 1 and Priority 2 fixes are implemented.
