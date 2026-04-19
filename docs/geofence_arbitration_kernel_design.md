# Geofence Arbitration Kernel (GAK) — Design Specification (7.2.3)

**Purpose:** Remove dual-driver runtime conflicts and non-deterministic cross-thread `AppState` writes **without** redesigning product behavior. This document defines the **Geofence Arbitration Kernel (GAK)** as middleware: timers stay, services stay, navigation and QR are untouched.

**Explicit product guarantee:** *No observable behavior change for end users under normal or peak load* when phases are executed with parity tests (GPS replay harness, audio capture diff, frame timing). Phase 1 is logging-only and does not alter outputs.

---

## 1. System classification (Step 1)

### 1.1 Location producers (who obtains GPS?)

| Producer | Trigger | Interval / cadence | Thread context |
|----------|---------|--------------------|----------------|
| **P1 — `BackgroundTaskService.RunLocationLoopAsync`** | `StartServices` → `Task.Run` | `Task.Delay(5000)` then `GetCurrentLocationAsync` | Thread pool |
| **P2 — `MapPage.StartTrackingAsync`** | `OnAppearingAsync` → `PeriodicTimer` | `TimeSpan.FromSeconds(5)` → `MapViewModel.UpdateLocationAsync` | Timer callback → async continuation (not guaranteed UI thread) |

Both call the same underlying `ILocationProvider` / device APIs.

### 1.2 Geofence evaluators (who calls `CheckLocationAsync`?)

| Evaluator | Path |
|-----------|------|
| **G1** | `BackgroundTaskService` → `_geofenceService.CheckLocationAsync(loc)` after setting `CurrentLocation` |
| **G2** | `MapViewModel.UpdateLocationAsync` → `_geofenceService.CheckLocationAsync(location)` after marshaling `CurrentLocation` to main thread |

`GeofenceService` internally uses `SemaphoreSlim` try-wait(0), movement threshold, cooldown, and (7.2) selection-match suppression.

### 1.3 `AppState.CurrentLocation` writers

| Writer | Marshaled to UI thread? |
|--------|------------------------|
| `MapViewModel.UpdateLocationAsync` | **Yes** (`MainThread.InvokeOnMainThreadAsync`) |
| `BackgroundTaskService.RunLocationLoopAsync` | **No** — direct assignment |

### 1.4 `SelectedPoi` writers (map / proximity context — related arbitration surface)

| Writer | Notes |
|--------|--------|
| `MapPage.StartTrackingAsync` | Auto-nearest: sets `_vm.SelectedPoi` **off** main thread in current code (`docs/flow_invariant_report.md` §4.V1) |
| `PoiEntryCoordinator` / `AppState.SetSelectedPoiByCode` | QR / deep link |
| `MapPage` pin tap, `PoiFocusService`, `PoiNarrationService.SyncUiAsync`, `LanguageSwitchService` | Various; several already marshal |

### 1.5 Producer → consumer graph (today)

```
[P1 BackgroundTaskService] ──┬──► AppState.CurrentLocation (background thread)
                               ├──► GeofenceService.CheckLocationAsync ──► Audio / logs
[P2 MapPage timer] ────────────┼──► MapViewModel.UpdateLocationAsync
                               │         ├──► AppState.CurrentLocation (UI thread)
                               │         └──► GeofenceService.CheckLocationAsync
                               │
[QR / coordinator / focus] ───┴──► SelectedPoi / navigation (separate axis; GAK must not alter)
```

**Conflict class:** Two independent **decision producers** for geofence (`G1`, `G2`) on overlapping timers; **two writers** for `CurrentLocation` with inconsistent threading.

---

## 2. Arbitration rules (Step 2)

### Rule A — Single tick authority

For each **logical location sample** presented to the system, **at most one** `CheckLocationAsync` execution may **commit** a geofence decision for that sample generation (kernel may coalesce rapid duplicate samples from P1+P2).

*Implementation note:* `GeofenceService` already suppresses re-entrancy with `TryWait(0)`; GAK adds **cross-producer** idempotency so two producers cannot both “win” the same wall-clock slice with identical coordinates.

### Rule B — Last-write-wins suppression (duplicate POI decision)

If two producers would invoke geofence with **equivalent** samples (same lat/lon within ε, same epoch bucket, e.g. 250 ms), the kernel **executes geofence once** and marks the tick satisfied. If samples differ meaningfully, the **latest** sample wins (matches intuitive GPS freshness) without adding **> 20 ms** synchronous work on the hot path (see §5).

### Rule C — UI thread isolation for shared `AppState` surface

All `AppState.CurrentLocation` assignments used for **binding** go through **one** kernel path that marshals to the UI thread (≤ one lightweight `MainThread` dispatch per published sample). Producers remain passive; they **publish** samples only.

### Rule D — Passive observers (MapPage)

`MapPage` **retains** its timer, distance math, pin drawing, bottom panel, and `PlayPoiAsync` orchestration. In **Phase 3**, the page **does not** call `CheckLocationAsync` directly; it only **publishes** location to GAK and **observes** `AppState` / events for display. **Externally** the page still “ticks every 5s” — no user-visible cadence change.

---

## 3. Geofence Arbitration Kernel architecture

### 3.1 Responsibilities (only)

1. **Ingest** `Location` + `producerId` (`"background"` | `"map"`) + optional `CancellationToken`.
2. **Marshal** authoritative `CurrentLocation` update to the UI thread (Rule C).
3. **Arbitrate** whether to invoke `IGeofenceService.CheckLocationAsync` this tick (Rules A, B).
4. **Emit** at most one geofence evaluation per coalesced sample; idempotent for duplicates.

### 3.2 Non-responsibilities (explicit)

- No Shell / navigation.
- No QR / `PoiEntryCoordinator` changes.
- No change to `GeofenceService` **policy** (radius, cooldown, jitter, 7.2 selection suppression) — kernel sits **above** it.
- No merge of `BackgroundTaskService` and `MapPage` into one timer (both remain).

### 3.3 Internal structure (logical)

```
┌─────────────────────────────────────────────────────────────┐
│                 GeofenceArbitrationKernel                    │
│  ┌──────────────┐   ┌─────────────────┐   ┌─────────────┐ │
│  │ Sample ingest│──►│ Coalesce / dedupe │──►│ Geo commit  │ │
│  │ (lock-free   │   │ (bounded compare, │   │ CheckLocation│
│  │  or short    │   │  <20ms CPU)       │   │ Async call) │ │
│  │  lock region)│   └─────────────────┘   └─────────────┘ │
│  └──────────────┘              │                           │
│           │                      ▼                           │
│           └──────────► MainThread: CurrentLocation          │
└─────────────────────────────────────────────────────────────┘
```

**Concurrency:** Prefer a **short critical section** (microseconds) for `(lastSample, lastCommitUtc)` comparison; await geofence **outside** the lock to avoid blocking. No `WaitAsync` with long timeouts on UI thread.

---

## 4. Input / output contract

### 4.1 API (conceptual)

```csharp
// Pseudocode — final names at implementation time
Task PublishLocationAsync(Location location, string producerId, CancellationToken cancellationToken = default);
```

**Inputs**

| Field | Type | Constraints |
|-------|------|---------------|
| `location` | `Location` | Non-null; kernel no-ops if null |
| `producerId` | `string` | `"map"` \| `"background"` (extensible for tests) |
| `cancellationToken` | `CancellationToken` | Propagate to `CheckLocationAsync` |

**Outputs / side effects**

| Effect | Owner |
|--------|--------|
| `AppState.CurrentLocation` | Kernel → **main thread** only |
| `IGeofenceService.CheckLocationAsync` | Kernel → **at most once** per coalesced tick |
| Logs / metrics (Phase 1) | Kernel (debug / structured) |

**Invariants**

- `PublishLocationAsync` never blocks the UI thread for > **20 ms** cumulative synchronous work (measure in profiling).
- No nested `MainThread` deadlock: avoid `InvokeOnMainThreadAsync` from an already-main-thread caller using a **detect-and-run-inline** pattern if required by platform.

---

## 5. Migration plan (Step 3) — three phases

### Phase 1 — Shadow mode (parity-safe)

- Add GAK type + DI registration.
- **Both** P1 and P2 call `PublishLocationAsync` **and** existing code paths remain (temporarily **double** geofence) **OR** (preferred for zero behavior drift in prod):  
  - **Option 1a (zero drift):** GAK only **observes** by receiving copies via wrapper that logs “would second producer fire within N ms?” without suppressing — **increases** work → only behind `#if DEBUG` or feature flag.  
  - **Option 1b (minimal drift):** GAK runs **only** `CurrentLocation` centralization in shadow while geofence still duplicated — fixes thread, still dual geofence until Phase 2.

**Recommendation for production discipline:** Use **feature flag** `GAK_SHADOW=1`: log divergences, no suppression of `CheckLocationAsync` until metrics show alignment.

**Exit criteria:** Log shows predictable overlap windows; no crash; CPU overhead within budget.

### Phase 2 — Soft switch (kernel owns geofence decision ingress)

- **Single** `CheckLocationAsync` caller: **only** GAK.
- `BackgroundTaskService` and `MapViewModel.UpdateLocationAsync` call `PublishLocationAsync` only.
- **Remove** direct `CheckLocationAsync` from one path first in canary, then both.
- `MapPage` tracking loop **unchanged** from outside (still 5 s); internally one line changes from VM geofence to kernel publish.

**Parity validation:** Recorded GPS trace replay — compare “geofence trigger timestamps” and “TTS start” before/after within ± one frame of OS scheduling.

### Phase 3 — Full arbitration (legacy paths are no-op decision producers)

- Producers do **not** touch `CurrentLocation` directly; only GAK does.
- `GeofenceService` remains the policy engine; GAK is the **sole ingress** for `CheckLocationAsync` from location polling.
- **SelectedPoi** auto-path (MapPage) optionally Phase-3b: marshal through same **UI arbitration** helper (separate small component or GAK sibling `MapSelectionArbitration` to avoid god-object) — **only** if still required after Phase 2; keeps GAK focused on location/geofence.

---

## 6. Risk analysis (Step 5 — VERY IMPORTANT)

### 6.1 UX risk

**Target: UX risk = 0**

| Risk | Mitigation |
|------|------------|
| Missed geofence trigger | Phase 2 coalescing must use **ε** no larger than `GeofenceService`’s own movement threshold semantics; prefer **time + duplicate sample** suppression only |
| Delayed TTS | Do not insert `Task.Delay` in kernel; `CheckLocationAsync` scheduling unchanged relative to sample arrival order |
| Map “feels” different | MapPage still runs same timer; only the **call site** of geofence moves |

### 6.2 Latency risk

| Item | Budget |
|------|--------|
| Synchronous work per `PublishLocationAsync` | **≤ 20 ms** (requirement) |
| `MainThread` dispatch | One hop per sample; uncontended typically **< 1 ms** |
| Lock contention | Hold lock only for comparison of value types / refs, **not** across `await` |

### 6.3 Race elimination (proof sketch)

1. **Single commit path for `CurrentLocation`:** All producers funnel to one method → **happens-before** edge for UI readers.
2. **Single commit path for geofence ingress:** After Phase 2, only GAK calls `CheckLocationAsync` → eliminates **cross-producer double evaluation** of the same tick class.
3. **`GeofenceService` internal gate:** Retains protection against re-entrant **same-thread** overlap; GAK handles **cross-thread** producer overlap.

### 6.4 Regression risk

| Regression | Mitigation |
|------------|------------|
| Deadlock | No `WaitAsync` on UI thread; no lock held across `await` |
| Battery | Same number of GPS reads as today (two loops) until a later **non-7.2.3** optimization; 7.2.3 does not merge timers |
| Tests | Golden trace diff for geofence + audio events |

---

## 7. Guarantee section

1. **Timers:** `BackgroundTaskService` 5 s loop and `MapPage` `PeriodicTimer` **remain**; external cadence unchanged.
2. **QR / navigation:** No changes to `PoiEntryCoordinator`, `INavigationService`, or deep link pipeline.
3. **TTS policy:** Still determined by `GeofenceService` + `PoiNarrationService` + existing 7.2 selection suppression; GAK does not change spoken text or language selection.
4. **End-user perception:** With Phase 2 implemented under coalescing rules in §2 and validated by replay harness — **no observable behavior change for end users under normal or peak load** beyond elimination of rare double-fire / thread glitches (which are non-functional improvements).

---

## 8. Implementation touch list (when coding — not part of this doc’s scope)

| Phase | Files (expected) |
|-------|------------------|
| 1–2 | `Services/GeofenceArbitrationKernel.cs` (new), `MauiProgram.cs` (DI), `Services/BackgroundTaskService.cs`, `ViewModels/MapViewModel.cs` |
| 2 | Remove direct `_geofenceService.CheckLocationAsync` from the above once GAK calls it |
| 3b (optional) | `Views/MapPage.xaml.cs` — `SelectedPoi` marshaling (separate from GAK if desired) |

---

## 9. Relation to prior audits

- **`docs/flow_invariant_report.md`:** Documents dual drivers and threading violations; GAK is the **prescribed** fix for **G1/G2** and **Background `CurrentLocation` writer**.
- **`docs/runtime_flow_stabilization_7_2.md`:** 7.2 geofence/UI dedupe remains valid; GAK **composes** above it without replacing cooldown logic.

---

*Document version: 7.2.3 — design-only. Implementation gated on Phase 1 metrics and Phase 2 replay parity.*
