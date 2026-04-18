# Event replay + contract introspection (6.7.6)

This phase adds **passive**, **append-only** capture and **offline** replay, reconstruction, and forensic utilities on top of the zero-drift contract stack (6.7.4) and telemetry layer (6.7.5). It does **not** change ingestion semantics, contract DTOs, or production hot-path behavior beyond an O(1) enqueue when capture is disabled.

## Event journal architecture

- **`ContractEventJournal`** (`ContractObservability/Replay/ContractEventJournal.cs`) implements **`IContractReplayCapture`**.
- Producers call **`TryCapture(source, wireJson, telemetry.Clone())`** only when **`IContractReplayCapture.IsEnabled`** is true (Debug builds register the journal; Release uses **`NoOpContractReplayCapture`** so **no JSON serialization** runs on the hot path).
- Ingestion is **non-blocking**: `Channel.TryWrite` with `DropWrite` when the channel is full; a single background consumer assigns a monotonic **`Sequence`**, stamps **`CapturedUtc`**, and appends a **`ContractJournalEntry`**.
- Storage is **in-memory**, **append-only** for retained rows; when over capacity, **oldest** rows are dropped (bounded memory). Historical rows are never mutated.
- Each **`ContractJournalEntry`** holds: `Sequence`, `CapturedUtc`, `EventTimestampUtc` (from producer timestamp when present), `CaptureSource` (e.g. `maui`, `api`, `api_invalid`), immutable **`WireJson`**, and a defensive **`Telemetry`** snapshot (**`ContractTelemetryWireSample.Clone()`**).

## Replay engine design

- **`EventReplayEngine.ReplayAsync`** yields **`ReplayFrame`** entries in deterministic order: **`NormalizedTimestamp`**, then **`Sequence`**.
- **Filters** (`ReplayOptions`): optional `FilterActionTypeWire`, `FilterPoiCode`, `FilterGeoSourceWire`.
- **Speed**: `SpeedMultiplier` scales inter-event delays derived from normalized timestamps; **`SkipDelays`** acts as fast-forward. Delays are **`Task.Delay` only** — no navigation, TTS, HTTP, or persistence side effects.
- **Step-through**: consumers drive pacing by awaiting each `ReplayFrame` from the async iterator (no hidden background work).

## State reconstruction model

- **`ContractStateReconstructor.TryReconstructAt`** selects all entries with **`NormalizedTimestamp <= T`**, ordered chronologically, and returns **`ReconstructedContractState`** (last POI, action, geo source, short action chain, last sequence).
- **`DescribePoiNavigationChain`** produces a read-only textual narrative for debugging (advisory).

## Forensic analysis logic

- **`ContractForensicAnalyzer.AnalyzeSession`** runs **read-only** heuristics on a session-ordered list: duplicate **`eventId`**, timestamp inversions, suspicious **`durationMs`**, **`fetchTriggered`** without **`poiCode`**, possible **QR → navigation** gaps (substring heuristics on `ActionTypeWire`), and **geo source** jumps for the same POI.
- Output: **`ContractForensicReport`** with **`AnomalyScore`** 0–100 and **advisory** hints (not authoritative root cause).

## Unified timeline

- **`UnifiedEventTimelineBuilder.NormalizedTimestamp`** prefers producer time, falls back to **`CapturedUtc`**.
- **`MergeChronological`** merges multiple journal snapshots (e.g. exported API + MAUI buffers) into one ordered view for cross-origin correlation.

## Safety constraints (no side effects)

- Replay and forensics operate only on **`ContractJournalEntry`** / **`ContractTelemetryWireSample`** data already in memory or supplied snapshots.
- **`ContractReplayDebugService`** is compiled **only in `DEBUG`** and is registered only in Debug configuration for MAUI and the API.
- Release builds use **`NoOpContractReplayCapture`**: interface **`IsEnabled`** is false, **`TryCapture`** is a no-op, and producers skip serialization.

## Integration points

| Location | Behavior |
|----------|----------|
| **`QueuedEventTracker.Track`** | After telemetry, if **`IsEnabled`**, serializes **`TranslationEvent`** with existing **`TranslationEventJsonOptions`** and captures **`maui`**. |
| **`EventsController.PostAsync`** | After telemetry, if **`IsEnabled`**, serializes **`EventContractV1Dto`** with **`ContractReplaySerialization.ApiWireSnapshot`** and captures **`api`** / **`api_invalid`**. |

## Acceptance mapping

| Criterion | Mechanism |
|-----------|-----------|
| Deterministic replay | Stable sort keys + immutable entries |
| No real side effects | Async iterator + delays only; no service calls |
| MAUI + API unified | Shared journal or **`MergeChronological`** on exported lists |
| Session reconstruction | **`EventSessionStream.FromJournal`** + reconstructor |
| Forensics without runtime mutation | **`ContractForensicAnalyzer`** over snapshots |
| Production latency | **`IsEnabled`** gate + channel enqueue only when enabled |
