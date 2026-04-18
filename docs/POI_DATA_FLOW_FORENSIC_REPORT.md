# POI Data Flow — Forensic Report

Evidence is from repository source only. Items not present in code are marked **NOT FOUND IN CODE**.

---

## 1. Executive Summary

- **MongoDB (backend)** is the **authoritative store** for POIs created/edited in **Admin Web** (`admin-web` → `POST /api/v1/pois` via `createPoi` in `admin-web/src/apiClient.js`, handled by `backend/src/controllers/poi.controller.js` → `poiService.createPoi` → `poiRepository.create` → Mongoose `Poi.create`).
- The **MAUI app does not subscribe to MongoDB**. With `useApiBackend = false` in `MauiProgram.cs`, **`IPoiQueryRepository` is `PoiDatabase` (SQLite)** only. The bundled **`pois.json`** seeds **SQLite** on first empty DB via `PoiHydrationService.LoadPoisAsync` → `LocalizationService.InitializeAsync` + `InsertManyAsync`.
- **Map pins / `AppState.Pois`** are built from **SQLite + in-memory `LocalizationService`** (`PoiHydrationService.LoadPoisAsync` / `RefreshPoisCollectionAsync`). There is **no background full-catalog sync** from Mongo on app start.
- **Optional partial refresh**: `MapPage.OnAppearingAsync` → `MapViewModel.SyncPoisFromServerAsync` → `PoiHydrationService.SyncPoisFromServerAsync` calls **`GET pois/nearby`** (relative URL built in code) **only if** `AuthService.IsAuthenticated` and `ApiService` exist. It upserts at most **50** POIs for **one fixed Vietnam bbox** and **page 1** — so many Mongo POIs never reach the device.
- **Secure QR** (`…/scan?t=<JWT>` parsed in `QrResolver.Parse` → `PoiEntryCoordinator.HandleSecureScanAsync`) calls **`POST pois/scan`** with `{ token }`, receives full POI payload, then **`MergeScanResultIntoLocalAsync`** → **`IPoiCommandRepository.UpsertAsync`** (SQLite) + **`ILocalizationService.RegisterDynamicTranslation`**. Navigation then hits Map/Detail with that code **already in SQLite and lookup**.
- **Plain QR** (`poi:CODE`, `poi://CODE`, `https://…/poi/{CODE}`, or alphanumeric code) uses **`NavigateByCodeAsync`**, which **only** does `_poiQuery.GetByCodeAsync` — **no HTTP**. If the row was never seeded or synced, the user gets **`POI not found in database`** (see `PoiEntryCoordinator.NavigateByCodeAsync`).

**Why the POI is “invisible” then appears after QR:** the device list reflects **SQLite + sync window**, not live Mongo. **Secure QR** (or a successful **nearby sync** that includes that POI) is a **second ingestion path** that **writes the POI into SQLite** and registers text in memory — so it **suddenly exists** for `GetByCodeAsync` / map hydration.

---

## 2. Full Flow Diagram (Text)

```
Admin Web (React)
  createPoi() → POST /api/v1/pois (Bearer admin JWT)
    → backend poi.controller.create → poi.service.createPoi → poiRepository.create → MongoDB

Mobile — cold start / Map first open
  MapPage.OnAppearingAsync
    → MapViewModel.LoadPoisAsync → PoiHydrationService.LoadPoisAsync
        → PoiDatabase.InitAsync (CREATE TABLE pois, indexes)
        → LocalizationService.InitializeAsync (read bundled pois.json → memory)
        → if GetCountAsync==0 → InsertManyAsync(core from JSON)  [SQLite seed]
        → GetAllAsync [SQLite] → hydrate with LocalizationService → AppState.Pois
    → (after load) SyncPoisFromServerAsync IF authenticated
        → GET pois/nearby?lat=…&lng=…&radius=…&limit=50&page=1
        → foreach item: UpsertAsync(poi) + RegisterDynamicTranslation → RefreshPoisCollectionAsync

Mobile — QR (camera / manual)
  QrScannerPage → QrScannerViewModel.HandleScannedCodeAsync
    → PoiEntryCoordinator.HandleEntryAsync
        → QrScannerService.ParseAsync → QrResolver.Parse(raw string)

Branch A — Secure URL / JWT
  QrResolver: path ends with /scan + query t= → IsSecureScanToken
  → HandleSecureScanAsync: ApiService.PostAsJsonAsync("pois/scan", { token })
  → Deserialize PoiScanApiResponse → MergeScanResultIntoLocalAsync
      → UpsertAsync (SQLite) + RegisterDynamicTranslation
  → Navigate //map?… or /poidetail?…

Branch B — Plain code / /poi/CODE
  → NavigateByCodeAsync → GetByCodeAsync(SQLite only) → fail if absent
```

---

## 3. QR Flow (Step-by-Step, Real Call Chain)

### 3.1 Entry points

| # | Location | Role |
|---|----------|------|
| 1 | `Views/QrScannerPage.xaml` + `QrScannerPage.xaml.cs` | `CameraBarcodeReaderView.OnBarcodesDetected` → `ProcessBarcodeOnMainThread` → `HandleScannedValueAsync` |
| 2 | `ViewModels/QrScannerViewModel.cs` | `HandleScannedCodeAsync` builds `PoiEntryRequest` (`RawInput`, `Source`, `PreferredLanguage`, `NavigationMode`) → `_coordinator.HandleEntryAsync` |
| 3 | `Services/PoiEntryCoordinator.cs` | Central router for QR / manual entry |

### 3.2 Data extracted from QR

Implemented in **`QrResolver.Parse`** (`Services/QrResolver.cs`):

- `poi://CODE` or `poi:CODE` → normalized **uppercase code string**.
- Absolute `http(s)` URL:
  - Path ends with `/scan` and query **`t`** → **`ScanToken` (JWT string)**, `IsSecureScanToken = true`.
  - Path `/poi/{CODE}` or `/p/{CODE}` → **code** from path segment.
- Fallback: single token alphanumeric/`_`/`-` (no `:` `/`) → treated as **code**.

**NOT FOUND IN CODE:** any QR format beyond the above (e.g. custom schemes not listed).

### 3.3 Call chain after parse

`PoiEntryCoordinator.HandleEntryAsync` (`Services/PoiEntryCoordinator.cs`):

1. `_qr.ParseAsync` → `QrScannerService.ParseAsync` → `QrResolver.Parse`.
2. If `IsSecureScanToken` → **`HandleSecureScanAsync`**.
3. Else → **`NavigateByCodeAsync`** with `parsed.Code`.

### 3.4 Secure branch — HTTP

- **Client:** `ApiService.PostAsJsonAsync("pois/scan", new { token }, …)` (see `PoiEntryCoordinator.HandleSecureScanAsync`). `HttpClient` base URL comes from **`BackendApiConfiguration.BaseUrl`** / `MauiProgram` registration (typically `…/api/v1/`).
- **Effective path:** `{BaseAddress}pois/scan` → aligns with **`backend/src/app.js`** `app.use('/api/v1/pois', poiRoutes)` and **`backend/src/routes/poi.routes.js`** `router.post('/scan', poiController.scan)`.
- **Method:** **POST**
- **Body:** JSON `{ "token": "<JWT from QR>" }` (property name `token` from anonymous object).
- **Auth:** `poi.routes.js` applies **`router.use(protect)`** before `/scan` — **JWT required**. Code checks `_auth.IsAuthenticated` before POST.

### 3.5 Backend chain (secure scan)

- **`backend/src/controllers/poi.controller.js`** `exports.scan` → `poiService.resolveQrScanToken(token, req.user)`.
- **`backend/src/services/poi.service.js`** `resolveQrScanToken`: `jwt.verify`, then `poiRepository.findByCode` or `findById`, status/premium checks, optional scan limit, **`_invalidateCache()`**, returns **`_mapModerationDto(poi)`**.
- **MongoDB:** `poiRepository.findByCode` / `findById` on **`backend/src/models/poi.model.js`** (via repository — **NOT DUPLICATED HERE**; repository file traced: `backend/src/repositories/poi.repository.js`).

### 3.6 Response → mobile mapping

- Mobile deserializes to **`PoiScanApiResponse` / `PoiScanData`** (`Models/PoiScanDtos.cs`).
- **`MergeScanResultIntoLocalAsync`** (`PoiEntryCoordinator.cs`):
  - Requires `data.Location != null`; otherwise **returns without writing** (geo not persisted).
  - Builds **`Poi`** (`Id`/`Code` = normalized code, lat/lng from `data.Location`, fixed `Radius = 50`, `Priority = 1`).
  - **`await _poiCommand.UpsertAsync(poi, …)`** → **`PoiDatabase.UpsertAsync`** (insert or update by `Id`).
  - **`_localization.RegisterDynamicTranslation`** for `"en"` / `"vi"` using `data.Content?.En` / `data.Content?.Vi` and `PoiServerContentParser.BuildLocalization` when strings present.

### 3.7 Storage

- **SQLite:** `FileSystem.AppDataDirectory/pois.db` (`PoiDatabase` ctor), table **`pois`** (`[Table("pois")]` on `Models/Poi.cs`).
- **In-memory:** `LocalizationService` dictionary `_lookup` for text.
- **NOT FOUND IN CODE:** separate on-disk cache for QR payload beyond `pois.db` and `event-buffer.json` (unrelated).

### 3.8 Post-merge navigation

- `_appState.SetSelectedPoiByCode(code)`
- `_poiQuery.InitAsync`
- `BuildRoute` → `//map?code=…&lang=…` (scanner adds `narrate=1`) or `/poidetail?…`
- **`INavigationService.NavigateToAsync`**

---

## 4. POI List / Map Flow (Why It Does Not “Auto-Update” from Mongo)

### 4.1 Entry point

- **`Views/MapPage.xaml.cs`** `OnAppearingAsync`: first time (`!_poisDrawn && !_isLoadingPois`) starts **`_vm.LoadPoisAsync()`** then on completion **`_vm.SyncPoisFromServerAsync()`**.

### 4.2 Data source for pins

- **`MapViewModel.LoadPoisAsync`** delegates to **`PoiHydrationService.LoadPoisAsync`** (`Services/PoiHydrationService.cs`).
- Flow: **`IPoiQueryRepository.InitAsync`** → **`ILocalizationService.InitializeAsync`** (reads **`pois.json`** from app package via `FileSystem.OpenAppPackageFileAsync`) → if DB empty **`InsertManyAsync`** from **`GetCorePoisForSeeding()`** → **`GetAllAsync`** from SQLite → hydrate → **`RefreshPoisCollectionAsync`** → **`AppState.Pois`**.

### 4.3 Does the list ever call backend to refresh?

- **Only** via **`SyncPoisFromServerAsync`** in **`PoiHydrationService`**: **`ApiService.GetAsync`** with hard-coded query **`pois/nearby?lat=16&lng=107.5&radius=1800000&limit=50&page=1`**.
- **Skipped** when not authenticated (`_auth?.IsAuthenticated != true`) — early return with debug `"[SYNC] Skip"`.

### 4.4 Offline-first?

- **Yes for reads** with current flag: **`useApiBackend = false`** → queries are **`PoiDatabase`** only (`MauiProgram.cs`).
- **Hybrid for writes:** QR secure path and optional nearby **push** data into SQLite + memory; there is **no** continuous “Mongo mirror”.

### 4.5 “Home” / other tabs

- **`AppShell.xaml.cs`**: tabs include **Explore**, **Map**, **QR**, **Profile**, etc. **`ExplorePage`** (`Views/ExplorePage.xaml.cs`) only navigates to map — **no POI list load**.
- **NOT FOUND IN CODE:** a dedicated “POI catalog” page that loads all Mongo POIs on demand.

---

## 5. SQLite Forensics

### 5.1 Schema (effective)

- ORM: **SQLite-net** on class **`Models/Poi`** (`[Table("pois")]`).
- **Persisted columns** (from `Models/Poi.cs` + `PoiDatabase.InitAsync` migrations): `Id` (PK), `Code`, `LanguageCode`, `Name`, `Summary`, `NarrationShort`, `NarrationLong`, `Latitude`, `Longitude`, `Radius`, `Priority`.
- Second table: **`PoiTranslationCacheEntry`** (`CreateTableAsync<PoiTranslationCacheEntry>`) for translation cache — **separate** from core POI list.

### 5.2 Insert

- **Bulk seed:** `PoiDatabase.InsertManyAsync` from `PoiHydrationService.LoadPoisAsync` when **`GetCountAsync() == 0`**.
- **Single row:** `InsertAsync` / **`UpsertAsync`** (if no existing id) used from **`MergeScanResultIntoLocalAsync`**, **`SyncPoisFromServerAsync`**, etc.

### 5.3 Update

- **`UpsertAsync`**: `GetByIdAsync` then **`UpdateAsync`** if row exists (`Services/PoiDatabase.cs`).
- **`UpsertManyAsync`**: loops `UpsertAsync` per POI.

### 5.4 Query (list / detail / nearby)

- **All on map list:** `GetAllAsync` → ordered by `Priority` descending.
- **By code:** `GetByCodeAsync` (warns if `lang` passed — ignored for lookup).
- **Nearby:** `GetNearbyAsync` loads **all** rows then filters in **memory** by Haversine distance (`Services/PoiDatabase.cs`) — **not** a SQL geo index.

### 5.5 Answers

| Question | Answer (from code) |
|----------|-------------------|
| When is POI inserted? | First-run empty DB seed from JSON; secure QR merge; optional nearby sync; other flows using `IPoiCommandRepository` |
| UPSERT or INSERT? | **`UpsertAsync`** = insert if missing else update |
| Duplicates? | One row per **`Id`** (PK). Convention: **`Id == Code`** for core rows — duplicate codes with same Id would update, not duplicate |
| TTL / expiration? | **NOT FOUND IN CODE** for POI rows (no expiry in `PoiDatabase`) |

---

## 6. Backend Behavior (Paths Traced)

| Concern | Implementation |
|---------|----------------|
| Mongo read | `poiRepository` / Mongoose models used in `poi.service.js` |
| `GET /api/v1/pois/nearby` | `poi.controller.getNearby` → `poiService.getNearbyPois` → **`poiRepository.findNearby`** with **`_publicVisibilityFilter()`** (APPROVED or missing status) |
| In-memory cache | **`backend/src/utils/cache.js`** via `poiCache` in `poi.service.js` (`getNearbyPois`, `getPoiByCode`); **`_invalidateCache`** on successful QR resolve |
| `POST /api/v1/pois/scan` | `poi.controller.scan` → **`resolveQrScanToken`** → **`_mapModerationDto`** in response `data` |
| Transform | **`mapPoiDto`** / **`_mapModerationDto`** flatten location to `{ lat, lng }` and text fields |

**NOT FOUND IN CODE (mobile):** direct `GET /api/v1/pois/code/:code` usage in MAUI services reviewed for list load (only nearby + scan traced above).

---

## 7. Root Cause of the “Magic”

1. **Admin Web** persists the POI to **MongoDB** only (`createPoi` → API → `create` repository). It does **not** update the mobile **`pois.json`** or SQLite.
2. **Mobile map list** is **`GetAllAsync` from SQLite** after optional **nearby** upsert (**max 50**, **fixed center**, **page 1**, **APPROVED-only** on backend). A new POI can **fail to appear** if: user **not logged in**, **not on Map tab** (load not run), **outside sync ranking**, or **>50 results** ahead of it, or **not APPROVED** (excluded in `findNearby` `$and` with `_publicVisibilityFilter`).
3. **Secure QR** bypasses the “is it in the 50?” problem for that POI: **`POST pois/scan`** returns **that** document, **`UpsertAsync`** inserts it into SQLite, **`RegisterDynamicTranslation`** adds text — so **the same `GetByCodeAsync` / hydration path** suddenly succeeds.

**Plain QR** for a code **only** in Mongo would **still fail** `NavigateByCodeAsync` until something else puts a row in SQLite — consistent with “magic” reports tied to **secure** / **server-backed** QR.

---

## 8. Real Architecture (As Implemented)

| Layer | Role |
|-------|------|
| **MongoDB** | Authoritative for admin-created POIs and API-served fields |
| **Backend Node** | REST + JWT; geospatial `findNearby`; scan redeem |
| **Bundled `pois.json`** | Initial catalog seed for **first** SQLite population |
| **SQLite `pois.db`** | Device-local **cache / store** for map and lookups (`IPoiQueryRepository` when `useApiBackend = false`) |
| **`LocalizationService`** | In-memory text catalog; static from JSON + **dynamic** from sync/QR |
| **`AppState.Pois`** | **UI source** for map binding after hydration |

---

## 9. Risks and Design Flaws (Code-Evident)

1. **Stale map:** No websocket/push; catalog only changes on **Map `OnAppearing`**, **language switch re-hydrate**, **nearby sync**, or **QR merge**.
2. **Partial sync:** **`limit=50`**, **`page=1`**, fixed **lat/lng** — many APPROVED POIs may never sync.
3. **Auth-gated sync:** Logged-out users **never** run `SyncPoisFromServerAsync` successfully.
4. **Secure QR requires login** in app (`HandleSecureScanAsync` early exit) while backend **`poi.routes`** also **`protect`** — consistent but easy to misread as “bug”.
5. **Plain vs secure mismatch:** Operators may print **`poi:CODE`** QRs for Mongo-only POIs → **`POI not found in database`** until a server path upserts the row.
6. **Duplicate / overwrite:** `UpsertAsync` by **`Id`**; QR merge uses **`Id = code`** — repeated scans **update** same row.
7. **Backend cache staleness:** `poiCache` TTL (`config.cache.ttl`) — invalidated on scan in **`resolveQrScanToken`** path via **`_invalidateCache`**, but other endpoints may serve cached **`getNearby`** until TTL.
8. **Cross-device inconsistency:** Each device has its own SQLite; no forced full sync.
9. **`MergeScanResultIntoLocalAsync`:** If API returns POI **without `location`**, method **returns immediately** — **no SQLite write** (`if (data.Location == null) return;`).

---

## 10. Tracking Integration Points (Forensic)

| Event | Exact hook (from codebase) |
|-------|----------------------------|
| **Translation / narration pipeline** | **`TranslationOrchestrator.RequestTranslationAsync`** → **`IPoiTranslationService.GetOrTranslateAsync`** (existing metrics); **`PoiTranslationService.GetOrTranslateAsync`** when cache miss → **`ITranslationProvider`** |
| **Data fetch (server POI payload)** | **`PoiEntryCoordinator.HandleSecureScanAsync`** after **`PostAsJsonAsync("pois/scan")`**; **`PoiHydrationService.SyncPoisFromServerAsync`** after **`GetAsync("pois/nearby?…")`** |
| **Data fetch (local POI row)** | **`GetPoiDetailUseCase.ExecuteAsync`** → **`IPoiQueryRepository.GetByIdAsync` / `GetByCodeAsync`**; **`PoiHydrationService.LoadPoisAsync`** → **`GetAllAsync`** |
| **Persist POI to device** | **`IPoiCommandRepository.UpsertAsync`** / **`InsertManyAsync`** (`PoiDatabase`) |
| **“True” translation start** (orchestrated) | **`TranslationOrchestrator.RequestTranslationAsync`** (single entry used for metrics in current design) |
| **QR success / failure (product analytics)** | **`QrScannerViewModel.HandleScannedCodeAsync`** result; **`PoiEntryCoordinator`** return `PoiEntryResult` — **NOT FOUND IN CODE:** dedicated `TranslationEvent`-style tracker on QR path |

---

## Appendix — Key File Index

| Area | Files |
|------|------|
| MAUI DI / query backend flag | `MauiProgram.cs` |
| QR UI | `Views/QrScannerPage.xaml.cs`, `ViewModels/QrScannerViewModel.cs` |
| QR routing | `Services/PoiEntryCoordinator.cs`, `Services/QrResolver.cs`, `Services/QrScannerService.cs` |
| Map load + sync | `Views/MapPage.xaml.cs`, `ViewModels/MapViewModel.cs`, `Services/PoiHydrationService.cs` |
| SQLite | `Services/PoiDatabase.cs`, `Models/Poi.cs` |
| Localization | `Services/LocalizationService.cs` |
| HTTP client | `Services/ApiService.cs`, `Configuration/BackendApiConfiguration.cs` |
| Backend POI API | `backend/src/app.js`, `backend/src/routes/poi.routes.js`, `backend/src/controllers/poi.controller.js`, `backend/src/services/poi.service.js`, `backend/src/repositories/poi.repository.js` |
| Admin create | `admin-web/src/apiClient.js` (`createPoi`), `admin-web/src/pages/MasterPoisPage.jsx` |
| DTOs for scan | `Models/PoiScanDtos.cs` |

---

*End of report.*
