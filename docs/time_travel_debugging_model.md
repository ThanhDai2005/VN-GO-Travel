# Time-travel debugging model (6.7.6)

This document describes how **normalized timelines**, **session streams**, **replay semantics**, and **forensic patterns** fit together for contract-level debugging.

## Timeline reconstruction model

1. **Capture** — Each event produces a **`ContractJournalEntry`** with **`WireJson`** plus **`ContractTelemetryWireSample`** (same projection as 6.7.5 telemetry).
2. **Normalize** — **`UnifiedEventTimelineBuilder.NormalizedTimestamp`** uses **`EventTimestampUtc`** when non-default; otherwise **`CapturedUtc`** so ordering remains stable when producers omit timestamps.
3. **Order** — Primary key: normalized time → **`Sequence`** → **`CaptureSource`** (for deterministic ties when merging feeds).

## Session-based grouping strategy

- **`EventSessionStream.FromJournal`** filters by **`sessionId`**, optional **`deviceId`** / **`userId`**, optional exact **`poiCode`**, then sorts.
- **`EventSessionStream.FromPoi`** lists all journal rows for a **`poiCode`** across sessions (useful for POI-centric audits).
- Session reconstruction at time **T**: **`ContractStateReconstructor.TryReconstructAt(stream.Entries, T, depth, out state)`**.

## Replay execution semantics

- **Input**: ordered **`IReadOnlyList<ContractJournalEntry>`** (often from **`ContractEventJournal.GetSnapshot()`**).
- **Execution**: **`EventReplayEngine.ReplayAsync`** applies filters, optionally scales delays between consecutive **normalized** timestamps, and yields **`ReplayFrame(StepIndex, Entry)`**.
- **1× / 5× / fast-forward**: set **`SpeedMultiplier`** to `1`, `5`, or use **`SkipDelays = true`** (or very large multiplier with **`MaxDelayPerStep`** cap).
- **Step-through**: use **`SkipDelays = true`** and advance manually in the debugger or UI by consuming one **`ReplayFrame`** at a time.
- **No services**: replay must never call navigation, audio, geofence, or HTTP clients; only **`Task.Delay`** and yield.

## Anomaly detection patterns (advisory)

| Pattern | Signal | Note |
|---------|--------|------|
| Duplicate chain | Same **`eventId`** multiple times in one session | May be benign retries; investigate idempotency |
| QR → navigation gap | QR-like **`ActionTypeWire`** not followed by navigation-like action within a short window | Heuristic substring match |
| State jump | **`NormalizedTimestamp`** goes backwards between adjacent rows | Clock skew or bad client timestamps |
| Geofence anomaly | **`GeoSourceWire`** changes between consecutive rows for same **`poiCode`** | Correlation-only |
| **`durationMs`** | Negative or extremely large | Pipeline normalization may differ on client |
| **`fetchTriggered`** | True with empty **`poiCode`** | Context mismatch hint |

Scores and hints are **non-authoritative**; they guide human review.

## Debugging workflow examples

### A. Reconstruct “what the client thought” at time T

1. Run app / API under **Debug** so **`ContractEventJournal`** is registered.
2. Reproduce the issue; call **`GetSnapshot()`** (via **`ContractReplayDebugService`** in DEBUG) or attach a dump exporter.
3. Build **`EventSessionStream.FromJournal(snapshot, sessionId)`**.
4. **`ContractStateReconstructor.TryReconstructAt(entries, T, chainDepth: 8, out state)`** and inspect **`ReconstructedContractState`**.

### B. Full session replay (no side effects)

1. **`await foreach (var frame in debugService.ReplaySession(sessionId, new ReplayOptions { SpeedMultiplier = 5 }))`**.
2. Log **`frame.Entry.Telemetry`** and **`frame.Entry.WireJson`** length or hash — avoid logging full PII in shared environments.

### C. Merge MAUI + API timelines

1. Export MAUI journal snapshot and API journal snapshot (same session id where possible).
2. **`UnifiedEventTimelineBuilder.MergeChronological(new[] { maui, api })`**.
3. Run **`ContractForensicAnalyzer.AnalyzeSession(merged)`** for a cross-origin forensic pass.

### D. Export for external tools

- **`ContractReplayDebugService.ExportReplayTrace()`** (DEBUG) emits **JSON Lines** with sequence, timestamps, capture source, wire JSON, and telemetry snapshot for jq / spreadsheets / SIEM.

## Operational boundaries

- **Production Release**: journal capture is **off**; replay APIs are **not** present in the binary.
- **Memory**: journal is **bounded**; long investigations should **export** early.
- **Privacy**: **`WireJson`** may contain PII; treat exports like production logs.
