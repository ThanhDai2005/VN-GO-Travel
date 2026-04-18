# Contract Locking — PROMPT 6.7.2 (MAUI ↔ API ↔ Mongo)

This phase **locks the v1 event contract** across the MAUI client model, **TranslationEvents.Api** ingestion DTO, and the documented Mongo target. **No QR, map, geofence, TTS, or analytics pipeline timing logic was changed** beyond field additions and enum alignment already described in 6.7.1.

---

## 1. Single source of truth — `EventContractV1`

**Version constant (both assemblies):** `contractVersion` = **`"v1"`** only.

| Constant | MAUI | API |
|----------|------|-----|
| Version string | `MauiApp1.Models.EventContractV1.Version` | `TranslationEvents.Api.Models.EventContractV1.Version` |
| JSON property name | `EventContractV1.VersionPropertyName` → `contractVersion` | Same literal in docs / DTO attribute |

### Final `EventContractV1` schema (wire = camelCase JSON)

| JSON field | Type | Required | Rules |
|------------|------|----------|--------|
| `contractVersion` | string | Implicit v1 if omitted at API; MAUI always emits `v1` after normalization | If present, must equal **`v1`** |
| `eventId` | string | Yes | Non-empty |
| `requestId` | string | Yes | Non-empty |
| `sessionId` | string | Yes | Non-empty |
| `poiCode` | string | Conditional | Required unless `source` is `nearby_sync` (case-insensitive) **or** `batchItemCount` is set |
| `language` | string | Conditional | Same as `poiCode` |
| `userType` | enum | Yes | `guest` \| `user` \| `premium` |
| `userId` | string | No | Nullable |
| `deviceId` | string | Yes | Non-empty |
| `status` | string | Yes | Snake pipeline status (e.g. `requested`, `success`, `app_event`) |
| `durationMs` | int64 | Yes | ≥ 0 |
| `timestamp` | ISO-8601 | Yes | Non-default `DateTimeOffset` |
| `source` | string | No | Domain label (`qr_scan`, `nearby_sync`, `translation`, …); drives batch-style relax rules |
| `actionType` | enum | Yes | See §2 |
| `networkType` | string | No | `wifi` \| `cellular` \| `offline` \| `unknown` (MAUI normalizes empty → `unknown`) |
| `userApproved` | bool | No | Optional |
| `fetchTriggered` | bool | Yes | Non-nullable; legacy JSON `null` → `false` (MAUI converter) |
| `latitude` | number | Conditional | Required when `geoSource` ≠ `unknown` |
| `longitude` | number | Conditional | Required when `geoSource` ≠ `unknown` |
| `geoRadiusMeters` | number | No | Optional POI radius snapshot |
| `geoSource` | enum | Yes | `unknown` \| `gps` \| `qr` \| `db` (default `unknown` if omitted in MAUI) |
| `batchItemCount` | int32 | No | Optional; used for nearby sync cardinality |

**Enums (wire names, camelCase via `JsonStringEnumConverter`):**

- **`actionType`:** `unknown`, `scan`, `navigate`, `geofence`, `deepLink`, `manual` — MAUI `AnalyticsActionKind`, API `EventActionKind` (same values).
- **`geoSource`:** `unknown`, `gps`, `qr`, `db` — MAUI `GeoSnapshotSource` (`Db` replaces legacy `manualOverride` on the wire as **`db`**), API `EventGeoSource`.

---

## 2. MAUI ↔ API mapping (before → after)

| Layer | Before 6.7.2 | After 6.7.2 |
|-------|----------------|-------------|
| **API `TranslationEventDto`** | 8 nullable fields; string `status`; no enums; no geo; no `eventId` / `actionType` / `fetchTriggered` contract | Full mirror of MAUI `TranslationEvent` + `contractVersion`; enums for `actionType`, `geoSource`, `userType`; `fetchTriggered` bool; `DateTimeOffset` timestamp |
| **`actionType`** | N/A (missing) | `EventActionKind` — JSON identical to MAUI `AnalyticsActionKind` |
| **`geoSource`** | N/A | `EventGeoSource` — JSON **`db`** aligned with MAUI `GeoSnapshotSource.Db` |
| **MAUI `GeoSnapshotSource`** | `ManualOverride` → JSON `manualOverride` | **`Db`** → JSON **`db`**; legacy `manualOverride` still **deserializes** to `Db` |

---

## 3. DTO / code changes summary

### MAUI (`MauiApp1`)

- `Models/EventContractV1.cs` — version constant + JSON property name.
- `Models/TranslationEvent.cs` — `ContractVersion` (default `v1`); cleaned formatting.
- `Models/AnalyticsEnums.cs` — `GeoSnapshotSource.ManualOverride` → **`Db`**.
- `Models/AnalyticsJsonConverters.cs` — read/write **`db`**; legacy `manualOverride` → `Db`.
- `Services/QueuedEventTracker.cs` — `WithStatusSnake` sets `contractVersion` when missing/blank.
- `Services/TranslationOrchestrator.cs`, `Services/PoiTranslationService.cs` — use `GeoSnapshotSource.Db`.

### API (`TranslationEvents.Api`)

- `Models/EventContractV1.cs`, `Models/EventContractEnums.cs`, `Models/TranslationEventDto.cs` — locked DTO.
- `Services/EventContractValidator.cs` — validation rules (§1 table).
- `Services/EventValidationService.cs` — delegates to `EventContractValidator`.
- `Program.cs` — camelCase JSON + `JsonStringEnumConverter` + `WhenWritingNull`.
- `Controllers/EventsController.cs` — rejection logs include `contractVersion`, `eventId`, `actionType`.

---

## 4. Validation rules (`EventContractValidator`)

1. `contractVersion`: empty/omitted → **valid** (treated as v1); any other non-empty value → **reject**.
2. `eventId`, `requestId`, `sessionId`, `deviceId`, `status`: required non-empty / non-default as applicable.
3. `durationMs` ≥ 0.
4. `timestamp` ≠ default.
5. `actionType` / `geoSource`: must be defined enum values (`Enum.IsDefined`).
6. **Geo consistency:** if `geoSource` ≠ `unknown`, both `latitude` and `longitude` must be non-null.
7. **`poiCode` / `language`:** required unless `source` is `nearby_sync` (case-insensitive) **or** `batchItemCount` has a value (batch-style events).

---

## 5. Versioning strategy

| Component | Behavior |
|-----------|----------|
| **MAUI** | Emits **`contractVersion: "v1"`** (default on model + `QueuedEventTracker` coercion for legacy buffers). |
| **API** | Accepts only **`v1`** when `contractVersion` is supplied; omits = implicit v1. |
| **Mongo** | Ingestion assumes **v1** document shape (flat BSON); no mixed-schema writes in the locked pipeline. |

Legacy payloads at the **API boundary** are rejected unless they satisfy v1 rules; **MAUI** normalizes older local buffers before re-emitting.

---

*End of contract locking document.*
