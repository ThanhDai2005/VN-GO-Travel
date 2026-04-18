# Contract observability and evolution intelligence (6.7.5)

This phase adds an **advisory observability layer** on top of the compiler-generated contract (6.7.4). It records **aggregate** field usage, enum distributions, duration percentiles, and contract-version counts **without** changing ingestion rules, the source generator, or product flows (QR, Map, Geofence, TTS).

## Telemetry architecture

| Component | Responsibility |
| --- | --- |
| `ContractTelemetryWireSample` | Immutable wire snapshot (MAUI + API). |
| `ContractTelemetryTracker` | Bounded `Channel` (`FullMode = DropWrite`) + **single** background consumer; O(1) enqueue on hot path. |
| `ContractTelemetryHostedService` | ASP.NET Core `IHostedService` that calls `EnsureStarted()` so the consumer is running. |
| MAUI hook | `QueuedEventTracker` calls `IContractTelemetryTracker.TryRecord` **after** buffering (no change to flush / sink semantics). |
| API hook | `EventsController` records **valid** and **invalid** DTOs via `ToContractTelemetryWireSample("api", …)`. |

**Non-blocking rule:** `TryRecord` only performs `ChannelWriter.TryWrite`. If the channel is full, samples are **dropped** (telemetry loss is acceptable vs. impacting user-facing latency).

**Storage:** In-memory rolling aggregates inside `ContractTelemetryTracker` (no new database dependency). Optional export: call `BuildUsageReport()`, `AnalyzeBreakingChangeRisk()`, or `BuildDashboardModel()` from diagnostics tooling, admin endpoints, or scheduled jobs.

## Field usage analytics model

`ContractFieldUsageReport` (see `ContractObservability/ContractFieldUsageReport.cs`) contains:

- `TotalEventsObserved`, `RejectedEventsObserved`
- `Fields[]` → `ContractFieldUsageRow` per JSON property:
  - `UsageRatePercent` — populated vs. total events (heuristic per field type)
  - `NullOrEmptyRatePercent` — empty / null / default signals where applicable
  - `DownstreamImpactScore` — simple 0–100 heuristic combining usage and fill quality
- `ActionTypeHistogram`, `GeoSourceHistogram`, `ContractVersionHistogram`
- `DurationPercentileSummary` — p50 / p95 / p99 over the last **2048** `durationMs` samples

**Dead / underused fields:** heuristics in `ContractEvolutionAdvisor` flag usage ≤ **1%** after **200+** events (advisory).

## Evolution recommendation logic (`ContractEvolutionAdvisor`)

Inputs: latest `ContractFieldUsageReport` + `BreakingChangeRiskResult`.

Outputs: `ContractEvolutionRecommendation` list with `Category`, `Summary`, `Rationale`, `SuggestedHumanAction`.

Categories include:

- `candidate_deprecation` — ultra-low usage
- `over_optional` — very high null/empty rate with low usage
- `high_value` — capped at **three** fields with strongest impact heuristic
- `v2_readiness_signal` — elevated breaking-change risk score
- `stable` / `sample_size` — guard rails when data is insufficient

**Policy:** recommendations are **never applied** automatically. Humans own V2 creation and rollout.

## Risk detection rules (`BreakingChangeRiskAnalyzer`)

Compares the **current** report with the **previous** snapshot captured after the last `AnalyzeBreakingChangeRisk` or `BuildDashboardModel` call:

- Per-field **usage drop** > 25 pp when prior usage > 15%
- Per-field **null/empty spike** > 30 pp when current null rate > 40%
- **Histogram shift** for `actionType` and `geoSource` (large share moves)

Produces `RiskScore0To100` (clamped), `AffectedSignals`, and a short `MitigationHint`.

## Lifecycle governance flow

1. **Emit** — MAUI / API enqueue `ContractTelemetryWireSample` instances (fire-and-forget).  
2. **Aggregate** — single consumer updates counters and duration window.  
3. **Observe** — operators pull `BuildUsageReport` / `BuildDashboardModel` on demand.  
4. **Advise** — `ContractEvolutionAdvisor` + `BreakingChangeRiskAnalyzer` produce human-readable guidance.  
5. **Decide** — version bumps and schema edits follow governance (6.7.4 spec + human approval); **no runtime auto-upgrade**.

## Relationship to CI (6.7.3)

CI `SchemaDiffChecker` remains the **structural** guard. Observability answers **behavioral** questions (who sends what, how often, how empty). Together they cover **shape** vs. **usage**.
