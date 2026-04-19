# Analytics Pipeline Audit — PROMPT 6.7.1

Scope: MAUI client pipeline **from `IEventTracker.Track` through `QueuedEventTracker` persistence and `LoggingTranslationEventBatchSink`**. As of **PROMPT 6.7.2**, **`TranslationEvents.Api` DTOs are aligned** with the same v1 contract (see `docs/contract_locking_6_7_2.md`).

---

## 1. Missing field analysis

| Field | Risk before 6.7.1 | After 6.7.1 |
|-------|-------------------|-------------|
| `fetchTriggered` | Optional `bool?`; could be null in JSON | Always `bool`; `null` in legacy JSON → **false** via converter |
| `actionType` | Free-form string; inconsistent casing | Enum + legacy string map → **canonical set** |
| `durationMs` | Could theoretically be negative; sync misused as row count | Clamped **≥ 0**; sync uses **elapsed ms** |
| Geo provenance | No explicit source | **`geoSource`** + optional radius |
| Batch size for sync | N/A | **`batchItemCount`** when applicable |

**Remaining optional fields (by design):** `userApproved`, `latitude`/`longitude` when no POI/device snapshot exists, `batchItemCount` for non-sync events.

---

## 2. Event inconsistency report

| Issue | Severity | Mitigation |
|-------|----------|------------|
| Mixed `actionType` vocabulary | High | Enum + normalizer + shared JSON options |
| `durationMs` semantics mixed (time vs count) | Medium | Sync duration vs `batchItemCount` split |
| Translation geo missing if DB has no row | Low | `geoSource: unknown`, coordinates omitted |
| Duplicate `AppEvent` on rapid QR dedupe | Low | Coordinator still suppresses duplicate navigation; analytics fires on successful navigation path only (unchanged behavior) |
| `TranslationOrchestrator` sync DB read per track | Low | Blocking `GetByCodeAsync` for snapshot only; acceptable volume for metrics |

---

## 3. Duplicate event risk assessment

| Source | Risk | Notes |
|--------|------|------|
| Translation pipeline | Low–Medium | Up to 5 events per `RequestTranslationAsync` (requested, dedup, success/fail/exception) — **intentional** lifecycle, not duplicates |
| QR | Low | Fires once per successful navigation branch |
| Nearby sync | Low | One event per successful sync completion |
| Cache hit | Medium | One event per cache hit per `GetOrTranslateAsync` call; could correlate with retries — acceptable for “view” analytics |

---

## 4. MongoDB readiness score (0–100)

| Criterion | Weight | Score |
|-----------|--------|-------|
| Flat JSON (no arbitrary nested objects) | 25 | 25 |
| Stable field names (camelCase) | 15 | 15 |
| Deterministic enums (`actionType`, `geoSource`, `status`, `userType`) | 20 | 20 |
| Index-friendly keys (`eventId`, `requestId`, `sessionId`, `poiCode`, `timestamp`, `actionType`, `geoSource`) | 20 | 20 |
| No platform handles / runtime-only types in payload | 10 | 10 |
| API DTO parity (post 6.7.2) | 10 | 10 |

**Total: 100 / 100** — MAUI + API + documented Mongo target share **EventContractV1**.

---

## 5. Compliance checklist (acceptance mapping)

| Requirement | Status |
|-------------|--------|
| 100% events contain `fetchTriggered` (non-null bool in JSON) | **Met** (`bool` + converter) |
| 100% `actionType` normalized to controlled set | **Met** (enum + legacy map) |
| 100% events include valid `durationMs` (≥ 0) | **Met** (normalizer) |
| No schema drift between producers | **Met** (shared `TranslationEvent` + `TranslationEventJsonOptions`) |
| Geo immutable after creation | **Met** (tracker copies fields; no mutation pass) |
| Mongo-ready without transformation | **Met** — BSON pass-through from validated DTO; index plan in `docs/mongo_contract_readiness_report.md` |

---

## 6. Final compliance status

**COMPLIANT** for PROMPT 6.7.1 + **6.7.2** contract locking (MAUI + **TranslationEvents.Api** + Mongo readiness).

---

*End of audit report.*
