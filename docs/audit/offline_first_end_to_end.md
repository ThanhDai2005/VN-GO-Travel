# Offline-first end-to-end audit (code-accurate)

## Scope checked
- Backend API: `backend/src/controllers/zone.controller.js`, `backend/src/services/zone.service.js`, `backend/src/controllers/poi.controller.js`, `backend/src/services/poi.service.js`, `backend/src/routes/zone.routes.js`
- Mobile (.NET MAUI): `Services/PoiDatabase.cs`, `Services/PoiSyncService.cs`, `Infrastructure/Remote/Repositories/PoiApiRepository.cs`
- Admin web: `admin-web/src` (no offline-first behavior found)
- Supporting docs/simulations present in repo: `backend/OFFLINE_SYSTEM_DOCS.md`, `backend/mobile-offline-system.js`, `backend/offline-system.js`, `backend/PRODUCTION_OFFLINE_DOCS.md`

## What is actually implemented end-to-end
### 1) Backend provides offline-friendly download + sync APIs
- **Zone download endpoint**: `POST /api/v1/zones/:code/download`
  - Routes: `backend/src/routes/zone.routes.js`
  - Controller: `backend/src/controllers/zone.controller.js` → `zoneService.getZonePoisForDownload(...)`
  - Behavior:
    - Requires auth + access check (`accessControlService.canAccessZone`)
    - Returns paginated POIs with audio metadata (`audio.url`, `audio.ready`, `narrationAudioUrl`)
    - Uses deterministic ordering + cursor paging
    - Triggers background audio generation if missing (`audioService.generateAudioAsync`)
- **Zone sync endpoint**: `GET /api/v1/zones/:code/check-sync`
  - Controller: `zoneController.checkZoneSync` → `zoneService.checkZoneSync(...)`
  - Returns:
    - `currentPoiCodes` (authoritative list)
    - `updatedPois` (by version/timestamp)
    - `currentVersion`, `currentTime`, `lastSync`, `lastVersion`
    - **Note:** `deletedPois` currently returns an empty array with TODO in service.
- **POI sync endpoint (global)**: `GET /api/v1/pois/check-sync`
  - Controller: `backend/src/controllers/poi.controller.js` → `poiService.checkContentSync(...)`
  - Returns updated/deleted POIs since `lastSyncTime`.

### 2) Mobile app stores POIs locally (SQLite) and uses local data as offline source
- **Local storage**: `Services/PoiDatabase.cs`
  - SQLite database at `FileSystem.AppDataDirectory/pois.db`.
  - Stores POI core rows and translation cache entries.
  - `IPoiQueryRepository` implemented here; used for offline reads.
- **Remote source**: `Infrastructure/Remote/Repositories/PoiApiRepository.cs`
  - `IApiClient` queries backend endpoints for POIs.
- **Sync service**: `Services/PoiSyncService.cs`
  - Calls `GET /api/v1/pois/check-sync?lastSyncTime=...`
  - Saves last sync time in `SecureStorage`.
  - Provides `CheckForUpdatesAsync()` and `MarkSyncCompletedAsync()`.

### 3) Offline-first decision point (current code)
- In the MAUI app, repository interfaces allow using **SQLite** (offline) or **API** (online). The exact orchestration is outside the files read here, but the local DB and remote repository are both present and operational.
- The backend explicitly supports **downloadable POI packages** per zone and **sync deltas** via `/zones/:code/check-sync` and `/pois/check-sync`.

## End-to-end flow (as implemented)
1. **Admin web** manages zones/POIs (no offline logic in admin UI).
2. **Mobile app** downloads POIs via `POST /api/v1/zones/:code/download`.
3. Returned POIs include audio metadata (`narrationAudioUrl` and `audio.ready`).
4. Client stores POIs locally (SQLite) for offline access.
5. Later, client uses `/api/v1/zones/:code/check-sync` or `/api/v1/pois/check-sync` to detect updates.
6. Client updates local storage as needed and records sync time in `SecureStorage`.

## What is NOT wired end-to-end in production code
- The repo contains **prototype/simulation** offline code in JS:
  - `backend/mobile-offline-system.js`, `backend/offline-system.js`, `backend/offline-system-production.js`, `backend/PRODUCTION_OFFLINE_DOCS.md`.
  - These are not referenced by backend routes or MAUI code; treat them as reference or design docs.
- `zone.service.js` has TODO for deleted POIs (`deletedPois` array is always empty).

## Admin web status
- No offline-first caching or sync logic found in `admin-web/src`.
- Admin UI consumes online APIs only.

## Key files to verify
- Backend: `backend/src/controllers/zone.controller.js`, `backend/src/services/zone.service.js`, `backend/src/controllers/poi.controller.js`
- Mobile: `Services/PoiDatabase.cs`, `Services/PoiSyncService.cs`, `Infrastructure/Remote/Repositories/PoiApiRepository.cs`

## Summary
- **Backend**: supports offline-first by exposing zone download + sync APIs and includes audio readiness metadata.
- **Mobile (MAUI)**: has SQLite persistence and a sync service calling `/api/v1/pois/check-sync`.
- **Admin web**: no offline-first mechanism detected in current code.