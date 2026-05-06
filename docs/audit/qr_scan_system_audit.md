# QR Scan + Purchase System Audit (Mobile App Focus)

**Project:** VN-GO-Travel6  
**Audit Date:** 2026-04-25  
**Auditor:** System Review  
**Scope:** .NET MAUI mobile app QR scan → map → POI → purchase flow, and local data persistence.

**Non‑negotiable statement:** **SYSTEM IS INCOMPLETE – PURCHASE DOMAIN DOES NOT EXIST.**

---

# 1. 🔍 FULL SYSTEM AUDIT

## 1.1 Observed User Flow (Mobile App)

| Step | Observed Component | Current Behavior | Notes |
|------|--------------------|------------------|-------|
| QR Scan | `Services/PoiEntryCoordinator` | Parses QR → navigates to POI detail or zone list | Handles scan tokens and direct code routes. |
| Navigation | `Shell` routes (e.g., `/zonepois`, `/poidetail`) | Navigation occurs without purchase state checks | No guard for guest access beyond login prompt. |
| POI interaction | `ViewModels/PoiDetailViewModel` | Loads POI, map focus, audio | No purchase logic or ownership tracking. |
| Purchase UI | `Views/ZonePoisPage.xaml.cs` | Has “Purchase” button logic | Acts on zone purchase only; no POI purchase system. |

## 1.2 Missing Guards / Broken Flows

- **Guest purchase guard is incomplete:** Zone purchase handler redirects to login, but does **not** display required message (“Please login to purchase”).
- **No UI state for “already purchased”:** AccessFrame visibility is toggled but not backed by persisted ownership state.
- **Premium logic is present and conflicts with requirements:** `PremiumService` and `AuthService.IsPremium` are active, violating “Premium feature must be removed”.
- **No purchase state stored in local SQLite:** No table stores purchases, ownership, or transactions.
- **Navigation & state race conditions:** POI loading is concurrent with map state arbitration; there is no purchase lock and no UI gating while navigation is in-flight.

## 1.3 Race Conditions Affecting Purchase UX

- **Zone list view loads POIs asynchronously and updates UI after purchase flow begins.** The access state can be stale when the purchase button is tapped.
- **POI detail navigation can happen without zone access revalidation.** POIs are shown regardless of purchase state.

---

# 2. 🔄 CURRENT PURCHASE FLOW (AS‑IS)

## 2.1 Guest clicks purchase

- `ZonePoisPage.OnPurchaseClicked` checks `_authService.IsAuthenticated`.
- If guest: navigates to `//login` and returns **without** showing the required message.
- No ownership or purchase history is recorded.

## 2.2 Logged-in user clicks purchase

- Confirmation dialog is shown.
- Calls backend endpoint `purchase/zone` with `zoneCode`.
- On success: shows a success alert and hides `AccessFrame` only.
- No purchase record is written locally.
- No revenue event or analytics event is recorded.

## 2.3 Where logic fails

- **No persistence layer for purchases.** App relies on the server response and immediate UI toggles only.
- **No duplicate purchase guard.** The same zone can be purchased repeatedly.
- **No consistent “already purchased” UI state.** Reloading the page resets access UI.

---

# 3. ❌ GAP ANALYSIS (CRITICAL)

## 3.1 Missing Components

| Area | Missing Component | Status | Impact |
|------|-------------------|--------|--------|
| Domain | PurchaseService | Missing | No central business logic or validation. |
| State | Purchase/Ownership state | Missing | UI cannot reflect access reliably. |
| Storage | Purchases table | Missing | **CRITICAL DATA LOSS RISK**. |
| Storage | Revenue logs | Missing | Analytics impossible. |
| Validation | Duplicate purchase check | Missing | Users can be charged multiple times. |
| Auth guard | Login-required message | Missing | Requirement not met. |
| Premium removal | PremiumService + IsPremium | Still present | Violates requirement. |

## 3.2 Data Persistence Status

**Is there any table storing purchased POIs?** **No** → **CRITICAL DATA LOSS RISK**  
**Is there any table storing user ownership?** **No** → **CRITICAL DATA LOSS RISK**  
**Is there any table storing transaction logs?** **No** → **CRITICAL DATA LOSS RISK**

---

# 4. 🧱 REQUIRED DATABASE DESIGN (VERY IMPORTANT)

**Target:** Local SQLite (offline-first) + sync-ready design.

## 4.1 Schema Overview

| Table | Purpose | Notes |
|-------|---------|-------|
| Users | Local user profile cache | Verify existence; must include Id used by AuthService. |
| Purchases | Ownership & purchase history | Core of purchase domain. |
| UserBalance (optional) | Credit balance cache | Optional if credits exist locally. |
| RevenueLogs | Analytics and revenue aggregation | Needed for revenue tracking. |

## 4.2 Table Definitions

### Users (verify if exists)

| Column | Type | Purpose |
|--------|------|---------|
| Id | TEXT (PK) | Auth user ID from server token. |
| Email | TEXT | User identity display and cross-reference. |
| CreatedAt | TEXT | Audit and lifecycle tracking. |

### Purchases

| Column | Type | Purpose |
|--------|------|---------|
| Id | TEXT (PK) | Unique purchase identifier. |
| UserId | TEXT (FK → Users.Id) | Ownership reference. |
| PoiCode | TEXT | Purchased POI or zone code reference. |
| Price | INTEGER | Amount paid (credits). |
| Currency | TEXT | “credits” per requirement. |
| PurchasedAt | TEXT | Transaction timestamp (UTC). |
| IsFakePurchase | INTEGER (0/1) | Marks simulated purchases. |

### UserBalance (optional)

| Column | Type | Purpose |
|--------|------|---------|
| UserId | TEXT (PK) | Ownership reference. |
| Credits | INTEGER | Current credits for UI display and offline checks. |

### RevenueLogs

| Column | Type | Purpose |
|--------|------|---------|
| Id | TEXT (PK) | Unique revenue event identifier. |
| TotalAmount | INTEGER | Amount added (credits). |
| Date | TEXT | Revenue event timestamp (UTC). |
| Source | TEXT | “QR”, “Map”, “Manual”. |

---

# 5. ⚙️ DOMAIN LOGIC DESIGN

## 5.1 PurchaseService

**Responsibilities:**
- Validate login.
- Validate already purchased.
- Simulate purchase (fake purchase allowed).
- Record transaction and analytics.

## 5.2 AuthGuard

**Responsibility:**
- Block guest purchase attempts and show message: **“Please login to purchase”**.

## 5.3 Ownership Check

**Responsibility:**
- Verify if user already owns the POI/zone to prevent duplicates.

---

# 6. 🔄 CORRECTED FLOW (TO‑BE)

## Guest

QR → Map → Click purchase → **BLOCK** → Show **“Please login to purchase”**

## Logged‑in user

QR → Map → Click purchase → **SUCCESS** → Save purchase → Update revenue → Unlock POI

---

# 7. 🧩 UI/VIEWMODEL FIXES

## Required

- **Remove Premium button and all premium UI states.**
- Add Purchase state binding (loading, success, failed).
- Add “Already Purchased” UI state with disabled purchase button.
- Add Login-required state that shows the exact message.

---

# 8. ⚠️ SYSTEM RISKS

- **Revenue data loss:** No transaction logging means revenue is unrecoverable.
- **Analytics impossible:** No revenue logs or purchase events to aggregate.
- **Inconsistent UI behavior:** Purchase success is not persisted; refresh resets access state.
- **Premium conflict:** Premium logic still exists; contradicts requirements.

---

# 9. 🛠️ IMPLEMENTATION PLAN (PHASED)

| Phase | Scope | Outcome |
|-------|-------|---------|
| Phase 1 | DB schema | Add Purchases, RevenueLogs, UserBalance. |
| Phase 2 | PurchaseService | Centralize validation, purchase recording. |
| Phase 3 | Auth integration | Enforce login-required message. |
| Phase 4 | UI binding fix | Remove Premium UI; add purchase states. |
| Phase 5 | Analytics tracking | Record revenue events and source. |

---

## Final Verdict

**SYSTEM IS INCOMPLETE – PURCHASE DOMAIN DOES NOT EXIST.**

This system currently implements a **UI-only purchase illusion** with no persisted ownership, no transaction logs, and no analytics pipeline. Shipping this as‑is will result in **untraceable revenue loss** and **inconsistent access control**.
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
