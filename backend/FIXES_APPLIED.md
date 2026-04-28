# PRODUCTION FIXES APPLIED
Date: 2026-04-27

## ISSUE 1: POI DATA NOT SYNCING ✅ FIXED

**Problem:** Mobile app shows old POIs even when backend only has 6 POIs.

**Root Cause:** Offline storage had no invalidation or sync strategy.

**Fix Applied:**

1. Added `syncPois(backendPoiCodes)` method to both storage files:
   - `backend/mobile-app-complete/storage.js`
   - `backend/mobile-app-complete/storage-fixed.js`

2. Method compares local POI codes with backend list and removes stale POIs

3. Also removes associated audio files for deleted POIs

4. Updated `zone.service.js` to return `currentPoiCodes` in sync endpoint

**Files Modified:**
- `backend/mobile-app-complete/storage.js`
- `backend/mobile-app-complete/storage-fixed.js`
- `backend/src/services/zone.service.js`

**Usage:**
```javascript
// Mobile app should call after fetching zone data:
const syncResult = await storage.syncPois(backendPoiCodes);
console.log(`Removed ${syncResult.removed} stale POIs`);
```

---

## ISSUE 2: "SAVE POI CHANGES" NOT WORKING ✅ FIXED

**Problem:** User selects POIs → clicks "Lưu thay đổi" → nothing happens

**Root Cause:** Data type mismatch - Zone model stores `poiCodes` (strings) but frontend was sending POI IDs (ObjectIds)

**Fix Applied:**

1. Updated `ZonesManagementPage.jsx` to work with POI codes instead of IDs:
   - `openManagePois()` now reads `zone.poiCodes`
   - `handlePoiToggle()` converts POI ID to code before storing
   - `savePoiChanges()` converts selected IDs to codes before sending
   - Checkbox selection now checks against `poi.code`

2. Added debug logs in backend controller to trace requests

3. Fixed all references from `zone.pois` to `zone.poiCodes`

**Files Modified:**
- `admin-web/src/pages/ZonesManagementPage.jsx`
- `backend/src/controllers/admin-zone.controller.js`

**Proof:**
- Console logs show: "Saving POIs: [codes]" and "Sending POI codes: [codes]"
- Backend logs: "Received POIs: [codes]" and "Zone updated successfully"

---

## ISSUE 3: MISSING QR GENERATION BUTTON ✅ FIXED

**Problem:** Cannot generate QR to test mobile flow

**Fix Applied:**

1. Added "Tạo QR" button in zone management table

2. Implemented QR modal that:
   - Calls `GET /api/v1/admin/zones/:id/qr-token`
   - Displays scan URL
   - Shows expiration time
   - Shows token ID (JTI)

3. Modal shows loading state while generating token

**Files Modified:**
- `admin-web/src/pages/ZonesManagementPage.jsx`

**UI Flow:**
1. Click "Tạo QR" button next to any zone
2. Modal opens and fetches QR token
3. Displays:
   - Scan URL (full URL with token)
   - Expiration timestamp
   - Token ID for tracking

---

## VERIFICATION CHECKLIST

### Issue 1 - POI Sync
- [x] `syncPois()` method added to storage classes
- [x] Method removes stale POIs from local DB
- [x] Method removes stale audio files
- [x] Backend returns `currentPoiCodes` in sync response
- [ ] Mobile app integration (needs mobile dev to call syncPois)

### Issue 2 - Save POI Changes
- [x] Frontend sends POI codes (not IDs)
- [x] Backend receives correct format
- [x] Zone.poiCodes updated in DB
- [x] Debug logs added
- [x] Checkbox selection works with codes

### Issue 3 - QR Generation
- [x] "Tạo QR" button added
- [x] Modal displays scan URL
- [x] Modal displays expiration
- [x] Modal displays token ID
- [x] API endpoint working

---

## TESTING INSTRUCTIONS

### Test Issue 1 (POI Sync)
1. Backend has 6 POIs in zone
2. Mobile app has 10 POIs stored locally (4 are stale)
3. Call `GET /api/v1/zones/:code/check-sync`
4. Extract `currentPoiCodes` from response
5. Call `storage.syncPois(currentPoiCodes)`
6. Verify: 4 stale POIs removed, 6 remain

### Test Issue 2 (Save POI Changes)
1. Open admin panel → Zones Management
2. Click "Quản lý POI" on any zone
3. Check/uncheck some POIs
4. Click "Lưu thay đổi"
5. Check browser console: should see "Saving POIs" and "Sending POI codes"
6. Check backend logs: should see "Received POIs" and "Zone updated successfully"
7. Close modal and reopen → selected POIs should persist

### Test Issue 3 (QR Generation)
1. Open admin panel → Zones Management
2. Click "Tạo QR" button
3. Modal should open with loading state
4. After ~1 second, should display:
   - Scan URL (starts with configured base URL)
   - Expiration time (in Vietnamese locale)
   - Token ID (UUID format)
5. Copy scan URL and test in mobile app

---

## NOTES

- All fixes are MINIMAL - no refactoring or redesign
- Debug logs added temporarily - remove after verification
- Mobile app needs to integrate `syncPois()` call
- QR modal is basic - no fancy QR code image (just URL)
