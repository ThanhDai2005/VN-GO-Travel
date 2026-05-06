# ZONE PURCHASE TRACE AUDIT (V2): END-TO-END VERIFICATION

**Auditor:** Antigravity (Senior System Debug Architect)
**Status:** EVIDENCE COLLECTED - MULTIPLE CRITICAL MISMATCHES IDENTIFIED
**Target:** VN-GO Travel Entitlement System

---

## 🧱 PART 1 — DATABASE TRUTH VALIDATION

### 1.1 Authority Collections (MongoDB)

| Collection Name | Authority Level | Field Key | Relationship |
| :--- | :--- | :--- | :--- |
| `zones` | Relationship Authority | `poiCodes[]` | Maps Zone to POIs (Denormalized) |
| `pois` | Entity Metadata | `code` | Agnostic of Zones (No `zoneCode` field) |
| `userunlockzones` | **SSoT (Purchases)** | `userId` + `zoneCode` | Primary proof of ownership |
| `userunlockpois` | Legacy/Audit | `userId` + `poiCode` | Bulk inserted during zone purchase |
| `credittransactions` | Ledger | `relatedEntity` | Tracks wallet deductions |

### ❗ Critical Ambiguity / Mismatch
- **Naming Conflict:** MongoDB contains both `userunlockzones` (populated) and `user_unlock_zones` (empty/legacy). The `consolidate_collections.js` script was required to resolve this, but any code using the snake_case name will see zero purchases.
- **Relational Gap:** The `pois` collection in MongoDB does NOT store `zoneCode`. The relationship exists ONLY in the `zones` collection via the `poiCodes` array.

---

## 🧠 PART 2 — SOURCE OF TRUTH DECISION

### 2.1 The Access Decision Logic

**Backend (`AccessControlService.js`):**
- **Logic:** `isPoiUnlocked(userId, code)` OR (`findZonesContainingPoi(code)` AND `isZoneUnlocked(userId, zoneCode)`).
- **SSoT:** The combination of `Zone.poiCodes` and `UserUnlockZone`.

**Mobile (`UserEntitlementService.cs`):**
- **Logic:**
  1. Read `Poi` from SQLite.
  2. Get `Poi.ZoneCode`.
  3. If `ZoneCode` is NULL -> **FAIL** (Returns `NotPurchased` / `NotForSale`).
  4. If `ZoneCode` exists -> Check `ZoneAccessService` (Local SQLite `ZonePurchase` table).
- **SSoT:** The local SQLite `pois` table's `ZoneCode` column.

👉 **THE FUNDAMENTAL DESIGN FLAW:**
The mobile app relies on **Secondary Metadata** (`Poi.ZoneCode` in SQLite) as a gatekeeper before checking the **Primary Authority** (Zone ownership). Because `pois.json` (seed data) often has NULL `ZoneCode` values, the app "forgets" that a POI belongs to a zone and denies access, even if the user owns the zone.

---

## 🔄 PART 3 — FULL FLOW TRACE

### FLOW B: Logged in → Purchase Success
1.  **UI:** User clicks "Buy" in `ZonePoisPage`.
2.  **API:** `POST /api/v1/purchase/zone` with `zoneCode`.
3.  **Backend:** Atomic transaction (Deduct credits -> Insert `userunlockzones` -> Insert `userunlockpois`).
4.  **Response:** `200 OK` with `newBalance`.
5.  **Mobile:** `ZoneAccessService` saves record to local SQLite `ZonePurchase` table.
6.  **Broadcast:** `ZonePurchasedMessage` sent.
7.  **Reaction:** `PoiDetailViewModel` calls `ReEvaluateAccessAsync`.
8.  **Final UI:** If SQLite metadata is correct, button turns to "Play". If `Poi.ZoneCode` is NULL, button stays "Buy".

### FLOW D: QR Entry → Direct POI Open
1.  **UI:** QR Scan -> `PoiEntryCoordinator.NavigateByCodeAsync`.
2.  **Logic:** Fetches POI from SQLite. **Crucially: No `zoneCode` is passed in the route.**
3.  **UI:** `PoiDetailPage` opens.
4.  **Failure:** ViewModel has no `zoneCode` from query, and SQLite `Poi` has NULL `ZoneCode`. Access is denied immediately.

---

## 🧨 PART 4 — BUG REPRODUCTION TRACE

**Bug:** "User purchased zone but POI still shows BUY and TTS"

1.  **Failure Point 1 (Metadata):** SQLite `Poi.ZoneCode` is NULL. `UserEntitlementService` returns `false`. UI shows "Buy".
2.  **Failure Point 2 (Narration):** User clicks "Play". `PoiNarrationService` calls `_zoneAccess.EnsureAccessAsync(poi.ZoneCode)`. Since `poi.ZoneCode` is NULL, it passes `""` (empty string) to the check.
3.  **Failure Point 3 (Fallback):** `PoiNarrationService` falls back to **TTS** because it cannot find the audio package (Path mismatch - see Part 6).

---

## 🧩 PART 5 — UI STATE MATRIX

| Condition | Expected UI | Current UI | Source of Truth | Bug? |
| :--- | :--- | :--- | :--- | :--- |
| Guest + POI in Zone | Buy Banner | Buy Banner | SQLite `Poi.ZoneCode` | No |
| Logged + Purchased | **Play Button** | **Buy Button** | SQLite `Poi.ZoneCode` | **YES (🔴)** |
| QR Scan (Owned) | **Play Button** | **Buy Button** | Route Params / SQLite | **YES (🔴)** |

---

## 🎧 PART 6 — AUDIO UNLOCK LOGIC TRACE

**Mismatch identified in Storage Paths:**
- **Download:** `AudioDownloadService.cs` saves to `AppData/audio-packages/{zoneCode}/{lang}/{poiCode}/`.
- **Playback:** `AudioPlayerService.cs` looks in `AppData/zones/{zoneId}/{fileName}`.

**Result:** The player will NEVER find the downloaded high-quality MP3s because they are stored in a different directory structure than the one the player expects. It defaults to TTS every time.

---

## 📊 PART 7 — INCONSISTENCY REPORT

| Severity | Issue | Evidence |
| :--- | :--- | :--- |
| 🔴 **Critical** | Metadata Dependency | `UserEntitlementService` fails if `Poi.ZoneCode` is NULL in SQLite. |
| 🔴 **Critical** | Path Mismatch | `AudioDownloadService` vs `AudioPlayerService` directory structures. |
| 🔴 **Critical** | Route 404 Loop | `ZoneAccessService` syncs to non-existent backend route. |
| 🟡 **Medium** | Denormalization Drift | `Zone.poiCodes` in Mongo vs `Poi.ZoneCode` in SQLite. |
| 🟢 **Minor** | Collection Naming | `user_unlock_zones` vs `userunlockzones` legacy drift. |

---
**Audit Conclusion:** The system is "Blind" in the mobile client. It relies on a local database column (`ZoneCode`) that is never reliably populated, and even when a purchase succeeds, a path mismatch prevents high-quality audio from playing.
