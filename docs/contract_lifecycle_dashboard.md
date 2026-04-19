# Contract lifecycle dashboard model

This document describes the **`ContractLifecycleDashboardModel`** payload (`ContractObservability/ContractLifecycleDashboardModel.cs`) and how metrics should be read in a future dashboard or ops tool.

## Dashboard model structure

| Property | Meaning |
| --- | --- |
| `GeneratedAtUtc` | Snapshot timestamp (UTC). |
| `CurrentContractVersion` | From `GeneratedContract.EventContractV1.Version` (today `v1`). |
| `Usage` | Full `ContractFieldUsageReport`. |
| `Risk` | `BreakingChangeRiskResult` from last compare window. |
| `EvolutionSuggestions` | Advisory list from `ContractEvolutionAdvisor`. |
| `DriftHistoryNotes` | Optional external notes (e.g. parsed CI markdown summaries). |
| `FieldHealthScoreByJsonName` | Quick map: JSON name → usage % (rounded) as a simple “heat” proxy. |

Build API (programmatic):

```csharp
var dashboard = tracker.BuildDashboardModel(driftNotes: myNotesFromCiArtifacts);
```

## Metrics definitions

### Field rows (`ContractFieldUsageRow`)

- **UsageRatePercent** — For strings: share of events with non-whitespace value. For nullable numerics: `HasValue`. For `fetchTriggered`: always counted as populated. For `durationMs` / `timestamp`: presence heuristics (timestamp non-default).
- **NullOrEmptyRatePercent** — Complement-style signal for “empty-ish” observations (strings blank, nullable unset, `userApproved` null, etc.).
- **DownstreamImpactScore** — `Clamp(usage * 0.65 + (100 - nullRate) * 0.35, 0, 100)` — **not** ML; suitable for ranking only.

### Distributions

- **actionType / geoSource** — Count maps keyed by **JSON wire** enum strings (camelCase aligned with API serialization).
- **contractVersion** — Histogram of `contractVersion` values (defaults folded to trimmed token).

### Duration (`DurationPercentileSummary`)

- Rolling window: last **2048** `durationMs` samples (non-negative clamped at ingest).
- **p50 / p95 / p99** — Order statistics on the in-memory window (cheap, not t-digest).

### Volume

- `TotalEventsObserved` — all ingested telemetry samples (MAUI + API labels).
- `RejectedEventsObserved` — API invalid partition only (`IngestionRejected: true`).

## Risk visualization model

Map `BreakingChangeRiskResult` as:

- **Gauge** — `RiskScore0To100` (green below 40, amber 40–69, red 70 and above).
- **List** — `AffectedSignals` tokens (`usage_drop:…`, `null_spike:…`, `actionType_shift:…`).
- **Callout** — `MitigationHint` text block.

Refresh cadence should be **minutes–hours**, not per-request UI polling at high QPS.

## Version evolution workflow

```text
[Telemetry aggregates]
        │
        ▼
[BuildUsageReport / BuildDashboardModel]
        │
        ├─► ContractEvolutionAdvisor (advisory list)
        └─► BreakingChangeRiskAnalyzer (vs prior snapshot)
        │
        ▼
[Human review + CI contract validation + spec edit in ContractDefinition]
        │
        ▼
[V2 design / new spec file] ──► never auto-switch runtime contract version
```

**Rules**

- **V1** remains the locked generated contract until humans author **V2** spec + generator strategy.
- Telemetry **never** writes back to Mongo schema, JSON schema snapshots, or the generator input.
- “V2 readiness” in telemetry is a **signal**, not an action.

## Suggested dashboard panels (future UI)

1. **Version mix** — bar chart from `ContractVersionHistogram`.  
2. **Field health table** — `Fields` with usage %, null %, impact score.  
3. **Action / geo distribution** — stacked bars from histograms.  
4. **Duration SLIs** — line or gauge for p50/p95/p99.  
5. **Risk + recommendations** — two columns: score + bullet advisory list.  
6. **CI drift** — embed or link latest `contract-schema-report.md` artifact (6.7.3) into `DriftHistoryNotes`.

This keeps the system **observable** and **self-analyzing** while preserving **human-controlled** evolution.
