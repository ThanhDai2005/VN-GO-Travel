# QR SCAN TO PURCHASE - TESTING GUIDE

**Date:** 2026-05-05  
**Purpose:** End-to-end testing guide for QR scan and zone purchase flow

---

## ✅ FIXES IMPLEMENTED

### 1. Backend Zone Endpoint (CRITICAL FIX)
**File:** `backend/src/controllers/zone.controller.js`
**Change:** Modified `getZoneByCode()` to return full POI details instead of just codes
**Impact:** Mobile app now receives complete POI data with locations, names, summaries

### 2. POI Schema Enhancement
**File:** `backend/src/models/poi.model.js`
**Change:** Added `imageUrl` field to POI schema
**Impact:** POI thumbnails can now be stored and displayed

### 3. Audio File 404 Race Condition Fix
**File:** `backend/src/services/audio.service.js`
**Change:** Check file existence BEFORE returning `ready: true` status
**Impact:** Prevents 404 errors when DB says ready but file is missing

### 4. Web Bridge Implementation
**File:** `backend/public/scan.html`
**Change:** Created HTML page for QR scan handling with deep link trigger
**Impact:** QR codes now open web page that triggers mobile app

### 5. Static File Serving
**File:** `backend/src/app.js`
**Change:** Added `/app` route to serve web bridge HTML
**Impact:** Web bridge accessible at `http://localhost:3000/app/scan.html?t={token}`

### 6. Mobile App Data Handling
**File:** `Views/ZonePoisPage.xaml.cs`
**Changes:**
- Added `IPoiCommandRepository` dependency injection
- Modified to parse `Pois` array from API response
- Added POI ingestion into local database
- Added localization registration for POI names
**Impact:** Mobile app now displays POI list correctly

---

## 🧪 TESTING STEPS

### Prerequisites
1. Backend server running on `http://localhost:3000`
2. MongoDB running with test data
3. Mobile app installed on device or emulator
4. At least one active zone with POIs in database

### Step 1: Create Test Zone (Admin)
```bash
# Use admin panel or API to create a zone
POST /api/v1/admin/zones
{
  "code": "TEST01",
  "name": "Test Zone",
  "description": "Test zone for QR scanning",
  "price": 100,
  "isActive": true,
  "poiCodes": ["POI001", "POI002", "POI003"]
}
```

### Step 2: Generate QR Code (Admin)
```bash
# Generate QR token for zone
POST /api/v1/admin/zones/{zoneId}/qr
Response:
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "scanUrl": "http://localhost:3000/app/scan?t=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "zoneCode": "TEST01",
  "expiresAt": "2026-05-06T10:00:00.000Z"
}
```

### Step 3: Test Web Bridge
1. Open browser (mobile or desktop)
2. Navigate to the `scanUrl` from Step 2
3. **Expected Result:**
   - Web page loads with zone information
   - Zone name, description, and POI count displayed
   - Preview of first 4 POIs shown
   - "Open in VN-GO App" button visible

### Step 4: Test Deep Link (Mobile Only)
1. On mobile device, click "Open in VN-GO App" button
2. **Expected Result:**
   - Mobile app opens automatically
   - App navigates to Zone POI List page
   - Zone name displayed in header
   - POI list populated with locations

### Step 5: Verify POI List Display
**Check the following:**
- ✅ Zone name displayed correctly
- ✅ POI count shows correct number
- ✅ Each POI shows: name, summary, code
- ✅ POI list is NOT empty
- ✅ Access status banner shows purchase option (if not purchased)

### Step 6: Test Purchase Flow (Authenticated User)
1. Ensure user is logged in
2. Check user has sufficient credits
3. Click "Purchase Zone" button
4. Confirm purchase in dialog
5. **Expected Result:**
   - Purchase successful message
   - Access banner disappears
   - User can now access all POIs

### Step 7: Test Purchase Flow (Guest User)
1. Logout or use guest mode
2. Scan QR code again
3. Click "Purchase Zone" button
4. **Expected Result:**
   - Redirected to login page
   - After login, can purchase zone

### Step 8: Test POI Detail Navigation
1. From Zone POI List, tap any POI
2. **Expected Result:**
   - Navigate to POI Detail page
   - POI information displayed
   - Audio player available (if audio ready)

---

## 🔍 VERIFICATION CHECKLIST

### Backend Verification
- [ ] `GET /api/v1/zones/{code}` returns `pois` array with full POI objects
- [ ] `GET /api/v1/public/zones/{code}` returns zone preview (6 POIs max)
- [ ] `POST /api/v1/zones/scan` works with JWT token
- [ ] Audio status check returns correct `ready` flag
- [ ] Audio files exist when status is `ready`

### Web Bridge Verification
- [ ] `/app/scan.html` accessible
- [ ] Token parsed from URL query parameter
- [ ] Zone information fetched from public API
- [ ] POI preview displayed correctly
- [ ] Deep link generated with correct format: `vngo://zone?token={jwt}`

### Mobile App Verification
- [ ] Deep link opens app correctly
- [ ] Zone POI List page loads
- [ ] POI list populated from API response
- [ ] POIs saved to local database
- [ ] Localization registered for POI names
- [ ] Access status banner shows/hides correctly
- [ ] Purchase button works for authenticated users
- [ ] Login redirect works for guest users

---

## 🐛 DEBUGGING TIPS

### Issue: POI List is Empty
**Check:**
1. Backend logs: Does `GET /api/v1/zones/{code}` return `pois` array?
2. Mobile logs: Does API response contain POI data?
3. Mobile logs: Are POIs being inserted into local database?
4. Database: Does zone have `poiCodes` array populated?

**Debug Commands:**
```bash
# Check zone in database
db.zones.findOne({ code: "TEST01" })

# Check POIs in database
db.pois.find({ code: { $in: ["POI001", "POI002"] } })

# Check backend response
curl http://localhost:3000/api/v1/zones/TEST01
```

### Issue: Web Bridge Not Loading
**Check:**
1. Is backend serving static files from `/app` route?
2. Does `backend/public/scan.html` exist?
3. Is token in URL valid?

**Debug Commands:**
```bash
# Test static file serving
curl http://localhost:3000/app/scan.html

# Test public zone API
curl http://localhost:3000/api/v1/public/zones/TEST01
```

### Issue: Deep Link Not Opening App
**Check:**
1. Is app installed on device?
2. Is deep link scheme registered in app manifest?
3. Is deep link format correct: `vngo://zone?token={jwt}`

**Mobile Logs:**
```
[QR-NAV] PoiEntryCoordinator.HandleSecureScanAsync start
[QR-NAV] Zone scan successful: code='TEST01' pois=3
[QR-NAV] zone scan navigating to zone POI list
```

### Issue: Purchase Fails
**Check:**
1. Is user authenticated?
2. Does user have sufficient credits?
3. Is zone price set correctly?
4. Check backend logs for purchase errors

**Debug Commands:**
```bash
# Check user credits
db.users.findOne({ email: "test@example.com" }, { credits: 1 })

# Check zone price
db.zones.findOne({ code: "TEST01" }, { price: 1 })

# Test purchase API
curl -X POST http://localhost:3000/api/v1/purchase/zone \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"zoneCode": "TEST01"}'
```

---

## 📊 EXPECTED API RESPONSES

### GET /api/v1/zones/{code}
```json
{
  "success": true,
  "data": {
    "code": "TEST01",
    "name": "Test Zone",
    "description": "Test zone for QR scanning",
    "price": 100,
    "isActive": true,
    "poiCodes": ["POI001", "POI002", "POI003"],
    "accessStatus": {
      "hasAccess": false,
      "requiresPurchase": true,
      "price": 100
    },
    "pois": [
      {
        "code": "POI001",
        "name": "Location 1",
        "summary": "Beautiful location",
        "languageCode": "vi",
        "location": {
          "lat": 10.762622,
          "lng": 106.660172
        },
        "radius": 100,
        "priority": 1
      }
    ]
  }
}
```

### GET /api/v1/public/zones/{code}
```json
{
  "success": true,
  "data": {
    "zoneCode": "TEST01",
    "name": "Test Zone",
    "thumbnail": "https://example.com/zone.jpg",
    "totalPois": 3,
    "pois": [
      {
        "poiCode": "POI001",
        "name": "Location 1",
        "thumbnail": null,
        "shortDescription": "Beautiful location"
      }
    ]
  }
}
```

### POST /api/v1/zones/scan
```json
{
  "success": true,
  "data": {
    "zone": {
      "code": "TEST01",
      "name": "Test Zone",
      "description": "Test zone for QR scanning",
      "price": 100,
      "poiCount": 3
    },
    "pois": [
      {
        "code": "POI001",
        "name": "Location 1",
        "summary": "Beautiful location",
        "location": { "lat": 10.762622, "lng": 106.660172 },
        "audio": {
          "url": "/storage/audio/abc123.mp3",
          "ready": true
        }
      }
    ],
    "accessStatus": {
      "hasAccess": false,
      "requiresPurchase": true,
      "price": 100
    }
  }
}
```

---

## ✨ SUCCESS CRITERIA

The system is working correctly when:

1. ✅ QR code scan opens web bridge page
2. ✅ Web bridge displays zone information
3. ✅ Deep link opens mobile app
4. ✅ Zone POI list displays all POIs
5. ✅ POI names and summaries are visible
6. ✅ Purchase button is functional
7. ✅ Authenticated users can purchase zones
8. ✅ Guest users are redirected to login
9. ✅ After purchase, access banner disappears
10. ✅ POI detail pages are accessible

---

## 🚀 DEPLOYMENT NOTES

### Environment Variables Required
```bash
# Backend .env
MONGO_URI=mongodb://localhost:27017/vngo
JWT_SECRET=your-secret-key
SCAN_QR_URL_BASE=https://yourdomain.com/app/scan
PORT=3000
```

### Production Checklist
- [ ] Update `SCAN_QR_URL_BASE` to production domain
- [ ] Configure CORS for mobile app domain
- [ ] Set up CDN for audio files
- [ ] Enable HTTPS for web bridge
- [ ] Test deep link on iOS and Android
- [ ] Verify QR code expiration works
- [ ] Test with real payment system

---

## 📝 NOTES

- QR tokens expire after 24 hours by default (configurable)
- Web bridge works on any device with browser
- Deep link only works on devices with app installed
- POI data is cached locally after first load
- Audio generation happens in background
- Purchase requires authentication and sufficient credits

---

**End of Testing Guide**
