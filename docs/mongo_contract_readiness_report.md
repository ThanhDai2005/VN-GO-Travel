# MongoDB Contract Readiness — POST 6.7.2

**Target:** BSON documents identical in shape to MAUI/API **EventContractV1** JSON (no extra transformation layer).

---

## 1. Schema compliance score: **100 / 100**

| Criterion | Status |
|-----------|--------|
| Flat document (no nested dynamic blobs) | Satisfied |
| camelCase field names | Satisfied |
| Deterministic enums (`actionType`, `geoSource`, `userType`) | Satisfied |
| `fetchTriggered` always boolean (never null on wire) | Satisfied |
| `durationMs` int64 ≥ 0 | Satisfied |
| `geoSource` always present (defaults to `unknown`) | Satisfied |
| `contractVersion` = `v1` | Satisfied (MAUI default + API rule) |
| No platform-specific types in payload | Satisfied |

Prior gap (API DTO misaligned) is **closed** in 6.7.2.

---

## 2. Recommended MongoDB indexes

Suggested compound / single-field indexes for analytics and TTL-style queries:

1. `{ "timestamp": -1 }` — time-range scans.
2. `{ "sessionId": 1, "timestamp": -1 }` — session timelines.
3. `{ "poiCode": 1, "timestamp": -1 }` — POI engagement (skip sparse for empty `poiCode` batch events if needed).
4. `{ "actionType": 1, "timestamp": -1 }` — funnel / action heatmaps.
5. `{ "geoSource": 1, "actionType": 1 }` — geo-quality reporting.

Optional: `{ "eventId": 1 }` unique for idempotent upserts.

---

## 3. Ingestion safety checklist

- [x] Validate at API with `EventContractValidator` before acknowledging batch.
- [x] Reject unknown `contractVersion` when explicitly set.
- [x] Reject negative `durationMs`.
- [x] Reject invalid enum values (binding + `Enum.IsDefined` guard).
- [x] Enforce geo rule: non-`unknown` `geoSource` requires `latitude` + `longitude`.
- [x] Relax `poiCode`/`language` only for documented batch-style events.
- [ ] **Operational:** Mongo unique index on `eventId` if idempotency required (deployment choice).

---

## 4. Drift elimination confirmation

| Path | Drift risk | Mitigation |
|------|------------|------------|
| MAUI → disk buffer | Low | Shared `TranslationEventJsonOptions` + `WithStatusSnake` + `contractVersion` coercion |
| MAUI → HTTP → API | Low | Same JSON field names and enum wire values |
| API → Mongo driver | None | Insert `TranslationEventDto`-shaped documents as BSON 1:1 |

**String-based `actionType`:** removed from API; MAUI uses **enum only** with JSON converters.

**Conclusion:** Ingestion can use **pass-through BSON** from validated DTOs with **zero custom mapping logic**.

---

*End of Mongo readiness report.*
