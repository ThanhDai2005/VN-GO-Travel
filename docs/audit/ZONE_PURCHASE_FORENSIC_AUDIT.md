# ZONE PURCHASE FORENSIC AUDIT: THE REALITY OF ENTITLEMENTS

**Auditor:** Antigravity (Principal Software Architect)
**Status:** ROOT CAUSES IDENTIFIED - PRODUCTION HAZARD DETECTED
**Target System:** VN-GO Zone Purchase & POI Unlock

---

## 🧠 PART 1 — SYSTEM OVERVIEW (REALITY)

Based on a deep trace of the codebase, the actual flow differs significantly from the ideal state:

1.  **User Opens POI:** The `PoiDetailPage` loads a POI from local SQLite. 
2.  **System Checks Zone:** `PoiDetailViewModel` calls `UserEntitlementService`, which re-queries the database for the POI's `ZoneCode`.
3.  **The Context Gap:** If the POI was seeded from `pois.json` (most are), the `ZoneCode` is frequently **NULL** in SQLite.
4.  **Backend Check:** If a user clicks "Purchase", the request is sent via `ApiService.PostAsJsonAsync("purchase/zone", ...)`. 
5.  **Database Persistence:** Backend updates MongoDB `UserUnlockZone` and `UserUnlockPoi` collections.
6.  **Client-Side Sync:** The app broadcasts a `ZonePurchasedMessage`. The `PoiDetailViewModel` catches this and refreshes.
7.  **Synchronization Failure:** A background task `SyncWithServerAsync` starts. It calls a non-existent API endpoint (`POST zones/{id}/purchase`), leading to a loop of failures.

---

## 🕵️ PART 2 — THE BREAKDOWN (WHY IT FAILS)

The "Buy" button remains visible (or access is revoked) due to three critical architectural flaws:

### 🚩 Root Cause 1: Stale POI-to-Zone Metadata (Metadata Drift)
*   **Location:** `UserEntitlementService.cs` + `PoiDatabase.sqlite`
*   **Description:** The entitlement check relies on the `ZoneCode` column in the local `Poi` table. If this column is empty (which it is for all newly discovered or legacy-seeded POIs), the app cannot link the POI to an owned zone.
*   **Result:** The UI remains locked even if the user owns the correct zone.

### 🚩 Root Cause 2: Non-Existent Sync Route (API Mismatch)
*   **Location:** `ZoneAccessService.cs` -> `TrySyncPurchaseAsync`
*   **Description:** The mobile app calls `POST /api/v1/zones/{zoneId}/purchase`. The backend only supports `POST /api/v1/purchase/zone`.
*   **Result:** All background synchronization attempts result in `HTTP 404 Not Found`.

### 🚩 Root Cause 3: The "Poisonous" Revocation Logic (Fatal Bug)
*   **Location:** `ZoneAccessService.cs` -> `ProcessSyncQueueAsync`
*   **Description:** The app has logic to delete local purchase records if synchronization fails 5 times. 
*   **Result:** Because of Root Cause 2, **the app systematically revokes user access** a few minutes after purchase once the retry limit is hit. This is the primary reason users see "Buy" again shortly after a successful transaction.

---

## 💾 PART 3 — DATABASE FORENSICS (MONGODB DATA FLOW)

To fully resolve the synchronization issues, we must map the exact persistence layer operations during the purchase and access cycles.

### 3.1 Zone Purchase Lifecycle (Backend Transaction)
When a user clicks "Purchase Zone", the backend executes an atomic transaction involving the following collections:

| Operation | Collection | Field/Description |
| :--- | :--- | :--- |
| **READ** | `zones` | Fetches `price`, `isActive`, and `poiCodes[]` to validate the zone. |
| **READ** | `users` | Fetches user's `wallet.balance` and `wallet.version` (for optimistic locking). |
| **WRITE** | `users` | Atomically deducts `price` from `wallet.balance` and increments `version`. |
| **WRITE** | `userunlockzones` | Creates a record linking `userId` + `zoneCode`. **(Primary Authority)** |
| **WRITE** | `userunlockpois` | Bulk inserts records for all `poiCodes` in the zone. **(Secondary Authority)** |
| **WRITE** | `credittransactions` | Creates an audit log of the credit deduction for history/support. |

### 3.2 POI Detail & Access Logic (The "How it Knows")
When a user views a POI, the backend determines access by checking relationships across these collections:

1.  **Identity Check:** Code reads from `pois` collection using `poiCode`. 
    - *Crucial:* It checks `isPremiumOnly`. If `false`, access is granted immediately.
2.  **Ownership Check 1 (Direct):** Queries `userunlockpois` for the specific `userId` + `poiCode`.
3.  **Ownership Check 2 (Parent Zone):** 
    - Code queries the `zones` collection to find any zone where the `poiCodes` array contains the current `poiCode`.
    - For each found zone, it queries `userunlockzones` to see if the user owns it.
    - **Logic Link:** `Zone` collection -> `poiCodes[]` contains `Poi.code` -> `UserUnlockZone` collection has `zoneCode`.

### 3.3 Mobile Local Database (SQLite)
The mobile app attempts to mirror the above state but fails due to metadata gaps:
- **Table `Poi`**: Contains `Code` and `ZoneCode`.
- **The Failure:** If the backend returns a POI via a "legacy" or "nearby" sync that doesn't include the `zoneCode` field, the local SQLite row remains unmapped. The client-side logic then fails step 3.2 (Parent Zone) because it doesn't know which zone to check.

---

## 🛠️ PART 4 — REMEDIATION STRATEGY

### 1. Fix the Synchronization Bridge
*   **Action:** Update `ZoneAccessService.cs` to use the correct API route (`purchase/zone`).
*   **Action:** **Remove the revocation logic.** If a sync fails, mark it for retry but *never* delete the local entitlement unless the server explicitly returns an "Unauthorized/Revoked" status.

### 2. Hydrate Metadata on Demand
*   **Action:** In `PoiDetailViewModel`, if the POI is missing a `ZoneCode`, trigger a lightweight API call to fetch the POI's parent zone metadata before evaluating access.
*   **Action:** Ensure `PoiEntryCoordinator` passes the `zoneCode` through all navigation routes.

### 3. Hardened UI State Machine
*   **Action:** Implement an `IsEvaluating` state in `PoiDetailViewModel`.
*   **Action:** Default the UI to "Locked" only after a confirmed server-side negative check, otherwise show a "Checking access..." state to prevent flicker.

---
**Conclusion:** The system is "Backend-Correct but Frontend-Fragile". The 404-triggered revocation loop is a critical production defect that must be addressed by aligning the API routes and hardening the local metadata hydration.
