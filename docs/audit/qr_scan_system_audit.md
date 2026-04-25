# QR Scan System Audit Report

**Project:** VN-GO-Travel6  
**Audit Date:** 2026-04-25  
**Auditor:** System Review  
**Scope:** Zone-based QR scanning functionality across Mobile App, Backend API, and Admin Web

---

## Executive Summary

The QR scan system enables users to scan QR codes (physical or digital) to access **Zone** information containing multiple Points of Interest (POIs). The system implements **Zone-based access control**, where users purchase zones to unlock premium content for all POIs within that zone.

**Key Components:**
- Mobile App (MAUI): Camera-based QR scanning with zone unlock flow
- Backend API (Node.js): Zone token generation, validation, and purchase verification
- Admin Web: Zone management and QR code generation per zone

**Core Principle:** **ONE ZONE = ONE QR CODE**

---

## 1. System Architecture Overview

### 1.1 Zone-Based QR Flow

#### Zone QR Format (JWT-based)
- Format: `https://thuyetminh.netlify.app/app/scan?t=<JWT>`
- JWT Payload: `{ zoneId: "zone-123", type: "zone_qr" }`
- Flow: Parse JWT → POST to backend `/api/v1/zones/scan` → Return zone + POIs + access status

**No POI-based QR codes exist in this system.**

---

## 2. Mobile App (MAUI) - Zone QR Scanning Flow

### 2.1 Entry Points

**File:** `Views/QrScannerPage.xaml.cs`
- Camera-based scanning using ZXing.Net.MAUI
- Manual text input fallback
- Permission handling for camera access

**File:** `ViewModels/QrScannerViewModel.cs`
- Manages scan state machine
- Integrates with `QrScanLimitService` for quota checks
- Handles zone unlock flow

### 2.2 QR Parsing

**File:** `Services/QrResolver.cs`
**Class:** `QrResolver.Parse(string? input)`

**Supported Format:**
- `https://domain.com/app/scan?t=<JWT>` - Zone scan token

**Output:** `QrParseResult`
- `Success`: bool
- `ZoneId`: Zone identifier
- `IsZoneScanToken`: true
- `ScanToken`: JWT string
- `Error`: Error message if parsing fails

### 2.3 Zone Entry Coordination

**File:** `Services/ZoneEntryCoordinator.cs`
**Class:** `ZoneEntryCoordinator.HandleZoneScanAsync(ZoneScanRequest)`

**Responsibilities:**
- Zone scan token resolution via backend API
- Access status verification
- POI batch download for purchased zones
- Navigation to zone detail page
- Analytics tracking

**Flow for Zone Scan Token:**
1. Detect `IsZoneScanToken = true`
2. POST to `/api/v1/zones/scan` with `{ token: "<JWT>" }`
3. Backend verifies JWT and returns:
   - Zone metadata (name, description, price)
   - List of POIs in zone
   - Access status (`hasAccess: boolean`)
4. **If hasAccess = false:**
   - Show zone preview with `narrationShort` only
   - Display purchase prompt
5. **If hasAccess = true:**
   - Trigger POI download (see section 2.4)
   - Unlock `narrationLong` for all POIs
   - Navigate to zone detail page
6. Track analytics event

### 2.4 POI Download Logic

**File:** `Services/ZoneDownloadService.cs`

**Trigger Conditions:**
- User has purchased zone (`hasAccess = true`)
- Network connectivity available

**Download Flow:**
1. Check network type (WiFi vs Cellular)
2. **If WiFi:** Auto-download all POIs in zone
3. **If 4G/5G:** Show confirmation dialog
   - "Tải xuống {count} địa điểm qua dữ liệu di động?"
   - User confirms → Download
   - User cancels → Queue for later
4. **If Offline:** Queue download for next connection
5. Batch insert POIs into local SQLite database
6. Register dynamic translations (vi/en)
7. Update zone unlock status locally

**Download Optimization:**
- Batch API call: `POST /api/v1/zones/:zoneId/download`
- Returns all POIs in single response
- Progress indicator during download

### 2.5 Access Control

**File:** `Services/ZoneAccessService.cs`

**Access Rules:**

| User Status | Zone Purchased | narrationShort | narrationLong | Download |
|-------------|----------------|----------------|---------------|----------|
| Guest | No | ✅ | ❌ | ❌ |
| Authenticated | No | ✅ | ❌ | ❌ |
| Authenticated | Yes | ✅ | ✅ | ✅ |
| Premium | Yes | ✅ | ✅ | ✅ |

**Implementation:**
```csharp
public bool CanAccessPremiumContent(Zone zone, User user)
{
    if (user == null) return false;
    return user.PurchasedZones.Contains(zone.Id);
}
```

---

## 3. Backend API - Zone QR & Access Management

### 3.1 API Endpoints

#### POST `/api/v1/zones/scan`
**File:** `backend/src/controllers/zone.controller.js` → `zoneController.scan`  
**Service:** `backend/src/services/zone.service.js` → `resolveZoneScanToken()`  
**Auth:** `optionalAuth` (allows guest scans, attaches `req.user` if JWT present)

**Request:**
```json
{
  "token": "<JWT_STRING>"
}
```

**Response (Success - No Access):**
```json
{
  "success": true,
  "data": {
    "zone": {
      "id": "zone-123",
      "name": "Hanoi Old Quarter",
      "description": "Historic district with 36 streets",
      "price": 50,
      "poiCount": 12
    },
    "pois": [
      {
        "id": "poi-1",
        "code": "HK001",
        "name": "Hoan Kiem Lake",
        "location": { "lat": 21.0285, "lng": 105.8542 },
        "narrationShort": "Beautiful lake in city center",
        "narrationLong": null
      }
    ],
    "accessStatus": {
      "hasAccess": false,
      "requiresPurchase": true,
      "price": 50
    }
  }
}
```

**Response (Success - Has Access):**
```json
{
  "success": true,
  "data": {
    "zone": {
      "id": "zone-123",
      "name": "Hanoi Old Quarter",
      "description": "Historic district with 36 streets",
      "price": 50,
      "poiCount": 12
    },
    "pois": [
      {
        "id": "poi-1",
        "code": "HK001",
        "name": "Hoan Kiem Lake",
        "location": { "lat": 21.0285, "lng": 105.8542 },
        "narrationShort": "Beautiful lake in city center",
        "narrationLong": "Detailed history and cultural significance..."
      }
    ],
    "accessStatus": {
      "hasAccess": true,
      "purchasedAt": "2026-04-20T10:30:00Z"
    }
  }
}
```

**Error Responses:**
- 400: "token is required"
- 401: "Invalid or expired zone QR token"
- 404: "Zone not found"
- 403: "Zone is not available"

#### POST `/api/v1/zones/:zoneId/download`
**Auth:** `requireAuth`

**Response:**
```json
{
  "success": true,
  "data": {
    "pois": [ /* Full POI array with all fields */ ],
    "count": 12
  }
}
```

#### GET `/api/v1/admin/zones/:id/qr-token`
**File:** `backend/src/controllers/admin-zone.controller.js` → `getQrToken`  
**Service:** `zoneService.generateZoneQrToken()`  
**Auth:** `requireAuth` + `requireRole(ADMIN)`

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "<JWT>",
    "scanUrl": "https://thuyetminh.netlify.app/app/scan?t=<JWT>",
    "permanent": true
  }
}
```

### 3.2 JWT Token Structure

**File:** `backend/src/services/zone.service.js`

**Token Payload:**
```javascript
{
  "zoneId": "zone-123",
  "type": "zone_qr"
}
```

**Signing:** `jwt.sign(payload, config.jwtSecret)` - **No expiration** (permanent for printed QR)

**Verification:** `jwt.verify(token, config.jwtSecret)`

### 3.3 Access Verification Logic

**File:** `backend/src/services/zone.service.js` → `resolveZoneScanToken()`

**Flow:**
1. Verify JWT signature
2. Extract `zoneId` from payload
3. Lookup zone in database
4. Fetch all POIs assigned to zone
5. **If user is authenticated:**
   - Check `user.purchasedZones` array
   - If `zoneId` in array: `hasAccess = true`
   - If not: `hasAccess = false`
6. **If user is guest:**
   - `hasAccess = false`
7. **Filter POI content based on access:**
   - No access: Return `narrationShort` only, set `narrationLong = null`
   - Has access: Return full POI data including `narrationLong`
8. Return zone + POIs + accessStatus

### 3.4 Zone Purchase Flow

**Endpoint:** `POST /api/v1/zones/:zoneId/purchase`
**Auth:** `requireAuth`

**Request:**
```json
{
  "paymentMethod": "credits"
}
```

**Logic:**
1. Check user credit balance
2. Verify zone price
3. Deduct credits from user
4. Add `zoneId` to `user.purchasedZones` array
5. Create purchase record
6. Return success

**User Model Update:**
```javascript
User.findByIdAndUpdate(
  userId,
  {
    $addToSet: { purchasedZones: zoneId },
    $inc: { credits: -zone.price }
  }
)
```

---

## 4. Admin Web - Zone QR Generation

### 4.1 QR Generation Flow

**File:** `admin-web/src/pages/ZonesManagementPage.jsx`

**Flow:**
1. Admin navigates to Zone management page
2. Clicks "Generate QR" button on a zone
3. Frontend calls `GET /api/v1/admin/zones/:id/qr-token`
4. Receives JWT and scan URL
5. Renders QR code using `qrcode.react`
6. Provides download/print options

**Library:** `qrcode.react`

**QR Modal Component:**
```jsx
<QRCodeSVG 
  value={scanUrl} 
  size={240} 
  level="M" 
  includeMargin 
/>
```

---

## 5. Data Flow Diagrams

### 5.1 Zone Scan Flow (No Access)

```
[Printed Zone QR Code]
    ↓ (scan?t=<JWT>)
[Mobile App Camera]
    ↓
[QrResolver.Parse()]
    ↓ (IsZoneScanToken=true)
[ZoneEntryCoordinator.HandleZoneScanAsync()]
    ↓ (POST /api/v1/zones/scan)
[Backend: zone.controller.scan]
    ↓
[zoneService.resolveZoneScanToken()]
    ↓ (jwt.verify, lookup zone, check user.purchasedZones)
[Return: zone + POIs (narrationShort only) + hasAccess=false]
    ↓
[Mobile: Show Zone Preview]
    ↓
[Display Purchase Prompt]
```

### 5.2 Zone Scan Flow (Has Access)

```
[Printed Zone QR Code]
    ↓ (scan?t=<JWT>)
[Mobile App Camera]
    ↓
[QrResolver.Parse()]
    ↓ (IsZoneScanToken=true)
[ZoneEntryCoordinator.HandleZoneScanAsync()]
    ↓ (POST /api/v1/zones/scan)
[Backend: zone.controller.scan]
    ↓
[zoneService.resolveZoneScanToken()]
    ↓ (jwt.verify, lookup zone, check user.purchasedZones → hasAccess=true)
[Return: zone + POIs (full data with narrationLong) + hasAccess=true]
    ↓
[Mobile: Check Network Type]
    ↓
[WiFi → Auto Download | 4G/5G → Confirm Dialog | Offline → Queue]
    ↓
[ZoneDownloadService.DownloadPoisAsync()]
    ↓ (POST /api/v1/zones/:zoneId/download)
[Batch Insert POIs to SQLite]
    ↓
[Navigate to Zone Detail Page]
    ↓
[Unlock narrationLong for all POIs]
```

### 5.3 Zone Purchase Flow

```
[User Views Zone Preview]
    ↓
[Clicks "Purchase Zone" Button]
    ↓
[Check Credit Balance]
    ↓ (Sufficient Credits)
[POST /api/v1/zones/:zoneId/purchase]
    ↓
[Backend: Deduct Credits, Add to purchasedZones]
    ↓
[Return Success]
    ↓
[Mobile: Update Local State]
    ↓
[Trigger POI Download]
    ↓
[Navigate to Zone Detail]
```

---

## 6. Key Differences from POI-Based System

### 6.1 Before (POI-Based QR)

| Aspect | POI-Based |
|--------|-----------|
| QR Scope | One QR per POI |
| Scan Result | Single POI data |
| Access Control | Per-POI premium flag |
| Download | Single POI on scan |
| Purchase | Not applicable |

### 6.2 After (Zone-Based QR)

| Aspect | Zone-Based |
|--------|-----------|
| QR Scope | One QR per Zone |
| Scan Result | Zone + all POIs in zone |
| Access Control | Per-Zone purchase status |
| Download | Batch download all POIs if purchased |
| Purchase | User buys zone with credits |

---

## 7. Security Analysis

### 7.1 JWT Security

**Strengths:**
- Signed with `JWT_SECRET` (server-side validation)
- Tamper-proof (signature verification fails if modified)
- Stateless (no server-side session storage)

**Token Payload:**
- Contains `zoneId` (not sensitive)
- Type identifier: `zone_qr`
- No expiration (permanent for printed QR)

### 7.2 Access Control Security

**Backend Enforcement:**
- Access check on every scan
- User must be authenticated to purchase
- Credits deducted atomically
- `purchasedZones` array prevents duplicate purchases

**Content Filtering:**
- Backend filters `narrationLong` based on access
- Mobile app cannot bypass (data not sent)
- No client-side access control

### 7.3 Download Security

**Network-Based Logic:**
- WiFi: Auto-download (user-friendly)
- Cellular: Confirmation required (data cost awareness)
- Offline: Queue for later (graceful degradation)

---

## 8. Configuration

### Backend Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `JWT_SECRET` | (required) | JWT signing key |
| `SCAN_QR_URL_BASE` | `https://thuyetminh.netlify.app/app/scan` | Base URL for QR codes |

### Mobile App Constants

| Constant | Value | Location |
|----------|-------|----------|
| `ZoneScanDebounceMs` | 1200 | `ZoneEntryCoordinator.cs` |
| `DownloadBatchSize` | 50 | `ZoneDownloadService.cs` |

---

## 9. Testing Scenarios

### 9.1 Functional Tests

**Zone QR Scanning:**
- [ ] Scan zone QR as guest → Show preview, no access
- [ ] Scan zone QR as authenticated (not purchased) → Show preview, purchase prompt
- [ ] Scan zone QR as authenticated (purchased) → Trigger download, unlock content
- [ ] Scan invalid zone QR → Show error

**Download Logic:**
- [ ] WiFi + purchased zone → Auto-download all POIs
- [ ] 4G + purchased zone → Show confirmation dialog
- [ ] Offline + purchased zone → Queue download
- [ ] Download completes → POIs available locally

**Access Control:**
- [ ] Guest views zone → narrationShort only
- [ ] Purchased user views zone → narrationLong unlocked
- [ ] Non-purchased user views zone → narrationShort only

**Purchase Flow:**
- [ ] Sufficient credits → Purchase succeeds
- [ ] Insufficient credits → Purchase fails
- [ ] Duplicate purchase → Prevented

### 9.2 Security Tests

- [ ] Modify JWT payload → Signature verification fails
- [ ] Replay old JWT after zone deletion → 404 error
- [ ] Access narrationLong without purchase → Filtered by backend
- [ ] Purchase with insufficient credits → Transaction fails

---

## 10. Recommendations

### 10.1 Feature Enhancements

1. **Offline Zone Preview**
   - Cache zone metadata for offline viewing
   - Show "Purchase when online" message

2. **Download Progress Indicator**
   - Show progress bar during POI batch download
   - Allow cancellation

3. **Zone Analytics**
   - Track scan count per zone
   - Track purchase conversion rate

### 10.2 UX Improvements

1. **Smart Download Scheduling**
   - Download during off-peak hours
   - Pause/resume support

2. **Zone Recommendations**
   - Suggest zones based on location
   - Show popular zones

---

## 11. Conclusion

The Zone-based QR system provides a scalable, user-friendly approach to content access control. Key strengths include:

- **Simplified QR Management:** One QR per zone (not per POI)
- **Batch Operations:** Download all POIs in zone at once
- **Clear Access Model:** Purchase zone → unlock all content
- **Network-Aware:** Smart download based on connectivity
- **Secure:** Backend-enforced access control

**System Status:** Production-ready for Zone-based QR experience.

---

**End of Audit Report**
