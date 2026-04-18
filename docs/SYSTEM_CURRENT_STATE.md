# SYSTEM CURRENT STATE

Short handoff for AI/dev. Update this file when stages change.

## Completed

- **Stage 1:** RBAC (`USER` / `OWNER` / `ADMIN`)
- **Stage 2:** Subscription (`isPremium` + feature gating; not used as authorization)
- **Stage 3:** Owner flow — `POST /api/v1/owner/pois` creates **`Poi`** with **`PENDING`**
- **Stage 4:** Admin moderation — `GET /api/v1/admin/pois/pending` (ADMIN, paginated `page` / `limit`), `POST /api/v1/admin/pois/:id/approve` and `POST /api/v1/admin/pois/:id/reject` (ADMIN only)
- **Stage 5:** Audit log — each successful **`PENDING` → `APPROVED` / `REJECTED`** transition **must** persist **`AdminPoiAudit`** (throws `500` if insert fails); **`GET /api/v1/admin/pois/audits`** (ADMIN, paginated, populated admin + poi); **no** PUT/PATCH/DELETE for audit documents
- **Stage 6:** Full backend integration tests — **`backend/tests/`** with **Jest + Supertest + mongodb-memory-server**; **`npm test`** (never uses production/real dev DB; in-memory Mongo + per-test collection clear)
- **Stage 7 (MAUI):** Auth + UI — **`AuthService`** (`POST .../auth/login`, parses **`{ "success": true, "data": { "token", "user" } }`** to match backend), **SecureStorage** for JWT + profile, **`ApiService`** + **`AuthDelegatingHandler`** (Bearer + **401 → logout**), **`LoginPage` / `ProfilePage`**, **`IAuthRepository`** via **`SessionAuthRepository`**; Shell tabs **Gui POI** / **Quan tri** visible only for **OWNER** / **ADMIN** when logged in; Map/QR/Explore unchanged for guests. API base: **`Configuration/BackendApiConfiguration.cs`**: **Windows DEBUG** → `http://localhost:3000/api/v1/`; **Android DEBUG** → `http://<host>:3000/api/v1/` where **emulator** uses `10.0.2.2`, **điện thoại thật** dùng **IPv4 máy dev** (cùng Wi‑Fi; `ipconfig`) hoặc **`127.0.0.1`** sau `adb reverse tcp:3000 tcp:3000`. **`AndroidManifest`**: `usesCleartextTraffic` enabled for HTTP dev.
- **Stage 8 (Web):** Public POI landing — folder **`web/`** (Vite + vanilla JS): route **`/poi/:code`** (or **`?code=`**), fetches **`GET /api/v1/pois/code/:code`** (`?lang=vi|en`), mobile-first UI, **Open in app** (`poi://CODE` / Android `intent://`), **Download** (Play Store). Dev proxy **`/api` → backend**; production **`VITE_API_BASE_URL`** + CORS on API host. **Read-only**; no backend/Maui changes.
- **Admin dashboard (Vite React):** folder **`admin-web/`** (port **5174**): **ADMIN-only** login (`POST /api/v1/auth/login`), pending queue (`GET /api/v1/admin/pois/pending`), approve/reject, audit log (`GET /api/v1/admin/pois/audits`). Dev proxy **`/api` → backend**; production **`VITE_API_BASE`** + CORS (include **`http://localhost:5174`** in **`CORS_ORIGIN`** for local admin).
- **Stage 7.3.0 (backend MVP):** User intelligence ingestion — **`POST /api/v1/intelligence/events/batch`** and **`/single`** (RBEL EventContractV2); optional env **`INTELLIGENCE_INGEST_API_KEY`** for `X-Api-Key` guest/device ingestion; Mongo collections **`uis_events_raw`**, **`uis_user_sessions`**, **`uis_user_profiles`**, **`uis_device_profiles`**; admin **`GET /api/v1/admin/intelligence/summary`** and **`GET .../journeys/:correlationId`**. Docs: **`docs/intelligence/`**. Jest uses **`MongoMemoryReplSet`** so admin **`withTransaction`** tests run on Mongoose 9.
- **Stage 7.3.1 (MAUI — RBEL client bridge):** Read-only tap on **ROEL** (`GetRecentSnapshot`) → bounded queue → batch (**100** events or **2 s**) → async **`POST .../intelligence/events/batch`**; **Bearer** or **`X-Api-Key`** via **`RbelBridgeConfiguration.IntelligenceIngestApiKey`**; background **`RbelBackgroundDispatcher`** started from **`App.xaml.cs`** (`Task.Run`). **Additive only** — **no** edits to **GAK**, **MSAL**, **NavigationService**, **GeofenceService**, or **ROEL decorator** logic. Spec: **`docs/bridge/rbel_client_bridge_v7_3_1.md`**.

## Current system behavior

- Admin can approve/reject POIs; transitions enforced in **`poi.service`**
- After a real transition, **`admin-poi-audit.service.recordModeration`** runs (mandatory)
- **`GET .../audits`** lists history newest-first with `page` / `limit`
- Public POI reads unchanged (approved + legacy no-`status`)
- **Audit logs are append-only via API** (immutable from client perspective). Local **`seed`** still clears collections for dev reset only.

## Architecture

- Controller → Service → Repository
- Moderation: **`poi.service`**; audit persistence/listing: **`admin-poi-audit.service`**

## Critical rules (do not break)

- No client-controlled `role`, `isPremium`, or `Poi.status` on non-admin paths
- Audit **`action`** values: **`APPROVE`** | **`REJECT`** only
- Do not add routes to update or delete audit rows
- Do not change RBAC/auth/subscription behavior when extending audits

## Not done yet (optional follow-ups)

- **AdminWeb (`AdminWeb/` MVC):** legacy ASP.NET admin (if present); **`admin-web/`** (Vite React) is the supported UI for Node moderation APIs.
- **MAUI:** wire **owner POI submit** to live **`ApiService`** end-to-end (beyond auth); optional premium gates; local SQLite/map flow remains default until switched.