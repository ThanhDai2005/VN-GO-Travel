# Analytics Pipeline Fix — PROMPT 6.7.1

This document records **data-layer-only** changes applied to the MAUI translation/analytics event pipeline. No POI, navigation, QR, map, or TTS business logic was altered beyond **field values passed into existing `IEventTracker.Track` calls**.

---

## 1. Schema fixes applied

| Area | Change |
|------|--------|
| **FetchTriggered** | Model is non-nullable `bool`. Legacy JSON `null` coerced via `FetchTriggeredBooleanConverter`. **Every** producer sets an explicit value; `QueuedEventTracker.WithStatusSnake` copies it unchanged (no nulls in output). |
| **ActionType** | Replaced free-form `string` with **`AnalyticsActionKind`** enum (`Models/AnalyticsEnums.cs`). JSON uses camelCase names (`scan`, `navigate`, `geofence`, `deepLink`, `manual`, `unknown`). Legacy string values deserialized via `AnalyticsActionKindConverter` + `AnalyticsActionKindNormalizer.FromLegacyString`. |
| **durationMs** | Type remains `long`. **`AnalyticsEventPipelineNormalizer.NormalizeDurationMs`** clamps to **≥ 0** on every enqueue/rehydrate (`QueuedEventTracker.WithStatusSnake`). Nearby sync now records **wall-clock** duration of the sync loop, not row count. |
| **Geo** | Added **`GeoSnapshotSource`** (`gps`, `qr`, `manualOverride`, `unknown`), **`GeoRadiusMeters`**, immutable snapshot fields **`latitude`** / **`longitude`** at emission. Producers set these once; tracker does not mutate coordinates after receipt. |
| **Batch cardinality** | Added optional **`batchItemCount`** (`int?`) for nearby sync only (row upsert count). Flat scalar; not a nested object. |
| **JSON consistency** | **`TranslationEventJsonOptions.Create()`** centralizes serializers for disk buffer + `LoggingTranslationEventBatchSink` (same converters, camelCase, `WhenWritingNull`). |

---

## 2. ActionType mapping table (before → after)

| Before (string) | After (`AnalyticsActionKind` / JSON) | Notes |
|-----------------|----------------------------------------|--------|
| `scan` | `Scan` / `scan` | QR entry analytics |
| `fetch` | `Manual` / `manual` | Nearby API pull (no separate “Fetch” enum member per controlled set) |
| `translate` | `Manual` / `manual` | Translation orchestrator pipeline |
| `view` | `Navigate` / `navigate` | Translation cache hit (read cached POI text) |
| *(missing / empty)* | `Unknown` / `unknown` | Default after normalization |
| Any other legacy string | `Unknown` / `unknown` | Unless listed in `AnalyticsActionKindNormalizer` |

**Reserved enum members not yet emitted by app code:** `Geofence`, `DeepLink` — reserved for future producers; deserialization accepts `geofence`, `deeplink`, `deep_link`, etc.

---

## 3. durationMs normalization rules

1. **On every pass through `WithStatusSnake`:** `durationMs = max(0, input)`.
2. **Translation events:** Stopwatch elapsed for `Requested` (0), `DedupHit` (0), `Success` / `Failed` / `Exception` (measured).
3. **QR `AppEvent`:** `0` (point-in-time).
4. **Nearby sync `AppEvent`:** `Stopwatch` over init + HTTP + parse + upserts + refresh (milliseconds).
5. **Cache hit `AppEvent`:** `0`.

Row count for sync is **not** stored in `durationMs`; it is stored in **`batchItemCount`**.

---

## 4. Geo event structure (final flat format)

All events share the same optional geo columns (Mongo-friendly, no nested GeoJSON blobs):

| Field | Type (JSON) | Meaning |
|-------|-------------|---------|
| `latitude` | number \| omitted | Snapshot WGS-84 latitude at emission |
| `longitude` | number \| omitted | Snapshot WGS-84 longitude at emission |
| `geoRadiusMeters` | number \| omitted | POI radius when anchored to a POI / QR payload |
| `geoSource` | string enum | `gps` \| `qr` \| `db` \| `unknown` (legacy `manualOverride` reads as `db`) |

**Producer rules (immutable at emission):**

- **QR (`PoiEntryCoordinator`):** `geoSource = qr`, lat/lng/radius from secure API location + fixed radius 50, or from SQLite `core` row for plain-code path.
- **Nearby sync (`PoiHydrationService`):** `geoSource = gps` when `AppState.CurrentLocation` is non-null, else `unknown`; lat/lng from device snapshot; `geoRadiusMeters` omitted.
- **Translation cache hit (`PoiTranslationService`):** `geoSource = manualOverride`, lat/lng/radius from the merged source POI used for cache read.
- **Translation metrics (`TranslationOrchestrator`):** `geoSource = manualOverride` when a core POI row exists for `poiCode` (sync read at track time); else `unknown`. Lat/lng/radius from that row when present.

Events are **records of snapshots**; the tracker never recomputes geo after creation.

---

## 5. Files touched (implementation)

- `Models/AnalyticsEnums.cs` (new)
- `Models/AnalyticsActionKindNormalizer.cs` (new)
- `Models/AnalyticsJsonConverters.cs` (new)
- `Models/TranslationEvent.cs`
- `Services/AnalyticsEventPipelineNormalizer.cs`
- `Services/TranslationEventJsonOptions.cs`
- `Services/QueuedEventTracker.cs`
- `Services/LoggingTranslationEventBatchSink.cs`
- `Services/TranslationOrchestrator.cs` (+ `IPoiQueryRepository` for geo snapshot only)
- `Services/PoiEntryCoordinator.cs`
- `Services/PoiHydrationService.cs`
- `Services/PoiTranslationService.cs`

---

## 6. Example normalized document (illustrative)

```json
{
  "eventId": "…",
  "requestId": "…",
  "sessionId": "…",
  "poiCode": "HCM",
  "language": "en",
  "userType": "user",
  "deviceId": "…",
  "status": "success",
  "durationMs": 842,
  "timestamp": "2026-04-18T14:00:00+00:00",
  "source": "translation",
  "actionType": "manual",
  "networkType": "wifi",
  "fetchTriggered": true,
  "latitude": 10.77,
  "longitude": 106.70,
  "geoRadiusMeters": 50,
  "geoSource": "manualOverride"
}
```

---

*End of fix log.*
