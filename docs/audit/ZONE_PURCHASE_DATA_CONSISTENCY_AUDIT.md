# SECOND-LEVEL FORENSIC AUDIT: DATA CONSISTENCY & ENTITLEMENT AUTHORITY

**Auditor:** Antigravity (Principal Distributed Systems Debugger)
**Status:** EVIDENCE-BACKED SYSTEM FLAW IDENTIFIED
**Scope:** VN-GO Zone Purchase System

---

## 🧠 PART 1 — SINGLE SOURCE OF TRUTH ANALYSIS

### 1.1 Authority Candidates
The system manages entitlements through three distinct mechanisms:

| Data Source | Type | Responsibility |
| :--- | :--- | :--- |
| `userunlockzones` | **Primary Authority** | Direct ownership of a tour package (Zone). |
| `zones.poiCodes[]` | **Relationship Authority** | Defines which POIs belong to which Zone. |
| `userunlockpois` | **Secondary Authority** | Individual POI access (written in bulk during zone purchase). |

### 1.2 Evaluation of Current Implementation
**"THE SYSTEM CURRENTLY TREATS HYBRID LOGIC AS AUTHORITY — THIS IS WRONG"**

**Why?**
The backend `AccessControlService.canAccessPoi` implementation creates a **Race Condition for Relationships**:
1. It first checks `userunlockpois`.
2. It then searches the `zones` collection for `poiCodes`.
3. If it finds a zone, it checks `userunlockzones`.

**The Flaw:** If the `zones` collection is updated (e.g., adding a POI to a zone) AFTER a user has purchased that zone, the `userunlockpois` collection will be missing the new POI. The user must rely on the "Relationship Authority" (`zones.poiCodes`) to remain consistent.

---

## 🗃️ PART 2 — REAL DATA VALIDATION (EVIDENCE)

### 2.1 The "DEMO" Prefix Drift (Fatal Mismatch)
Inspection of `vngo_travel.userunlockzones.json` vs `vngo_travel.zones.json` reveals a critical naming drift:

*   **User Purchase Record:**
    ```json
    { "userId": "69ea30ab...", "zoneCode": "DEMO_HCMC_DISTRICT1" }
    ```
*   **Primary Zone Collection:**
    ```json
    { "code": "HO_CHI_MINH_CITY_DISTRICT_1", "name": "Ho Chi Minh City District 1" }
    ```

**❗ PROOF OF FAILURE:**
The user owns `DEMO_HCMC_DISTRICT1`. However, the current system looks for `HO_CHI_MINH_CITY_DISTRICT_1`. 
**Result:** The user is locked out of their purchased content because the legacy "DEMO" codes were not migrated or aliased.

### 2.2 Relationship Mismatch
*   **Zone:** `HO_CHI_MINH_CITY_DISTRICT_1` contains `CHO_BEN_THANH`.
*   **User Unlock POI:** User `69f087dd...` has access to `VNM-SGN-001`.
*   **Conflict:** `VNM-SGN-001` is not in the `poiCodes` for `HO_CHI_MINH_CITY_DISTRICT_1`.
*   **Result:** The system cannot determine that `VNM-SGN-001` belongs to any owned zone, forcing a "Buy" button state.

---

## 🔗 PART 3 — RELATIONSHIP INTEGRITY

### 3.1 Orphan POIs
*   **Detection:** POIs like `HO_TAY` and `BAO_TANG_HCM` (found in `pois.json`) are **NOT** present in any zone's `poiCodes` array in `zones.json`.
*   **Impact:** These POIs can NEVER be purchased via a zone. They are effectively "Locked for All" unless they are marked free.

### 3.2 Non-Indexed Lookups
*   **Trace:** `Zone.findZonesContainingPoi(poiCode)` uses a filter `{ poiCodes: poiCode }`.
*   **Index Status:** `Zone.index({ poiCodes: 1 })` is **MISSING**.
*   **Performance:** Every access check for a POI requires a collection scan of the `zones` table.

---

## 📡 PART 4 — BACKEND QUERY TRACE

### 4.1 Purchase Flow (Atomic Transaction)
1.  `db.users.findOne({ _id: userId })` -> Get wallet.
2.  `db.zones.findOne({ code: zoneCode })` -> Get price & POIs.
3.  `db.users.updateOne({ _id: userId, wallet.version: v }, { $inc: { balance: -price } })`
4.  `db.userunlockzones.insertOne({ userId, zoneCode })`
5.  `db.userunlockpois.insertMany([{ userId, poiCode: p1 }, ...])`

### 4.2 Access Check Flow
1.  `db.userunlockpois.findOne({ userId, poiCode })`
2.  `db.zones.find({ isActive: true, poiCodes: poiCode })`
3.  `db.userunlockzones.findOne({ userId, zoneCode: foundZoneCode })`

**❗ THE INCONSISTENCY:** If step 1 fails, the system relies on step 2. If step 2 uses an unindexed or outdated `poiCodes` array, the check fails.

---

## 📱 PART 5 — SQLITE VS MONGODB DRIFT

The most critical runtime failure happens in the **Mobile Mirror**:

*   **Mongo (Authority)**: Relationship is in `Zone.poiCodes`. `Poi` is agnostic.
*   **SQLite (Mirror)**: Relationship is hardcoded in `Poi.ZoneCode`.

**❗ DRIFT ANALYSIS:**
1. `pois.json` (Mobile Seed) contains `HO_GUOM` with `ZoneCode: null`.
2. `vngo_travel.zones.json` (Mongo) contains `HO_GUOM` inside `HANOI_OLD_QUARTER`.
3. **The Result:** The mobile app sees `ZoneCode == null` in SQLite and returns `AccessState = NotForSale` immediately, bypassing the server-side entitlement check entirely.

---

## 💣 PART 6 — TRANSACTION ATOMICITY CHECK

The backend uses `session.withTransaction`. Atomicity is **GUARANTEED** for:
- Wallet deduction
- Zone unlock record
- POI unlock records

**HOWEVER**, the transaction DOES NOT include the **Event Logger** or **Cache Invalidation**.
If the transaction succeeds but the API response fails to reach the mobile app, the mobile app remains in a "Stale" state until a manual refresh is triggered.

---

## 🔄 PART 7 — SYNC LOOP ANALYSIS (DEEP)

### 7.1 The "Death Loop"
1. User buys zone (success in Mongo).
2. Mobile starts `SyncWithServerAsync`.
3. Request calls `POST zones/{id}/purchase` (Invalid route -> 404).
4. Mobile increments `RetryCount`.
5. At `RetryCount == 5`, the app calls `RemovePurchaseAsync` (Local).
6. **THE DATA CRIME:** The app deletes the local record of the purchase because it couldn't "sync" it, even though the purchase is already permanent on the backend.

---

## 🐛 PART 8 — DATA BUG LIST

| Bug ID | Description | Proof |
| :--- | :--- | :--- |
| **BUG-001** | Legacy "DEMO_" codes in ownership records. | `userunlockzones` has `DEMO_HCMC_DISTRICT1`. |
| **BUG-002** | Missing `ZoneCode` in SQLite. | `Models/Poi.cs` has `ZoneCode`, but `pois.json` has NULLs. |
| **BUG-003** | 404 Revocation. | `ZoneAccessService.cs:220` deletes local data on sync fail. |

---

## 💣 PART 9 — FUNDAMENTAL DESIGN FLAW

**"DISTRIBUTED STATE WITHOUT RECONCILIATION"**

The mobile app attempts to maintain its own "Truth" (SQLite) while only syncing on a "Push-on-Purchase" basis. Because there is no **Background Pull** or **Full Reconciliation** (comparing local state vs `/auth/me` response) on app startup, any missed sync or metadata drift becomes permanent, leading to the "Persistent Buy Button" phenomenon.

---
**Audit Conclusion:** The system is failing because the mobile app relies on **incomplete metadata** (SQLite `ZoneCode`) and **fragile sync triggers** that actively destroy local state upon network/route errors.
