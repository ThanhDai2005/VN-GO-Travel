# QR Scan 404 - Root Cause Analysis (RCA)

## 🔍 Symptom
Scanning a Zone QR code returns a 404 (Not Found) error on the mobile app.

## 🛠️ Investigation Checklist

### 1. Backend Route Validation
- [x] `app.js` mounts `zoneRoutes` at `/api/v1/zones`
- [x] `zone.routes.js` defines `POST /scan` -> `zoneController.scanZoneQr`
- [ ] **Action**: Verify logs to see the incoming URL.

### 2. Controller & Service Logic
- [x] `ZoneController.scanZoneQr` extracts `token` from `req.body`.
- [x] `ZoneService.resolveZoneScanToken` verifies JWT.
- [ ] **Potential Failure**: `zoneRepository.findByCode(zoneCode)` returns null (404).
- [ ] **Potential Failure**: `poiRepository.findByCodes(zone.poiCodes)` fails or returns empty? (Unlikely to cause 404 if zone is found).

### 3. Data Integrity (Database)
- [ ] **Query**: `db.zones.find({ code: "SCANNED_CODE" })`
- [ ] **Check**: Does the `zoneCode` in the JWT payload match the actual `code` field in MongoDB?
- [ ] **Check**: Is the zone `isActive: true`? (If false, returns 403, not 404).

### 4. QR Content Audit
- [ ] **Check**: What URL is encoded in the QR?
    - Base: `https://thuyetminh.netlify.app/app/scan`
    - Full: `https://thuyetminh.netlify.app/app/scan?t=JWT_TOKEN`
- [ ] **Mobile Parsing**: Does `QrResolver.cs` correctly extract the `t` parameter?
- [ ] **API Call**: Is the mobile app calling `POST /api/v1/zones/scan`?

## 🧪 Simulation Test
We will run a script to simulate the exact flow.

```javascript
// backend/scratch/test_qr_404.js
const axios = require('axios');
const API_BASE = 'http://localhost:3000/api/v1';

async function test() {
    // 1. Get a token from admin
    // 2. Call /zones/scan with that token
    // 3. Check result
}
```
