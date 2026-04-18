# Runtime flow stabilization (7.2)

This step tightens **MAUI runtime behavior** only: gating, ordering, deduplication, and concurrency guards. It does **not** change contract definitions, generated DTOs, telemetry/replay (6.7.x), CI, or analytics schema.

## Goals

| Area | Outcome |
|------|---------|
| QR / deep link | Single coordinator authority; no parallel entry; duplicate payloads suppressed |
| Translation | One in-flight execution per `(code, lang)`; fewer redundant analytics emissions |
| Map / geofence | Serialized focus updates; geofence skips when UI already selected the same POI |
| Bootstrap | Deterministic Shell-ready order: localization surface → pending deep links |

---

## QR flow stabilization design

**Authority:** `PoiEntryCoordinator.HandleEntryAsync` remains the only navigation + POI-resolve entry for in-app QR, manual entry, and deep links (`DeepLinkHandler`).

**Concurrency:** A `SemaphoreSlim(1,1)` wraps the full async body so two threads cannot interleave parse / navigate / analytics between await points (replaces a non-async-safe boolean).

**Duplicate suppression:** After resolving a **normalized POI code**, the coordinator checks a short time window (`DuplicateEntrySuppressionMs`, 2500) against the last successfully handled code **before** mutating `AppState` or navigating. Same code inside the window returns `Success=true`, `Navigated=false` without side effects.

**Scanner VM:** `QrScannerViewModel` debounces **identical raw strings** within 1200 ms (camera multi-frame) before invoking the coordinator.

### Before vs after (text diagram)

**Before (risk):**

```
Thread A: HandleEntryAsync ─┬─ set _isHandling
Thread B: HandleEntryAsync ─┴─ may pass bool before A awaits → double Shell route
```

**After:**

```
Caller ──► Semaphore (1) ──► parse ──► dup? ──► navigate ──► mark last code
                ▲
                └── second caller waits (serialized) or runs after A completes
```

---

## Translation deduplication strategy

Existing layers preserved:

- `PoiTranslationService`: per `(code, lang)` semaphore + double-check after cache miss.
- `TranslationOrchestrator`: in-flight task dictionary for identical keys.

**7.2 adjustment:** `TranslationEventStatus.Requested` is emitted **only** when a **new** in-flight task is created. Joiners that attach to an existing task emit **only** `DedupHit`, avoiding paired `Requested`+`DedupHit` noise and double-count semantics for the same translation lifecycle.

---

## Map / geofence consistency model

**Selected POI source of truth:** `AppState.SelectedPoi` (unchanged).

**Focus serialization:** `PoiFocusService.FocusOnPoiByCodeAsync` acquires a process-wide mutex so concurrent QR query handling + map pin selection cannot interleave `SelectedPoi` writes or duplicate `RequestTranslationAsync` triggers from focus.

**Geofence vs UI:** If the winning geofence candidate’s **code** equals `AppState.SelectedPoi.Code`, proximity TTS is skipped. That prevents **map pin / QR narration** and **background geofence** from speaking the same POI back-to-back while the user is already on that POI in the UI.

**Existing jitter controls retained:** movement threshold, location interval throttle, per-POI cooldown, re-entrancy gate in `GeofenceService`.

---

## App bootstrap pipeline definition

`AppBootstrapPipeline` (static helper) documents and enforces ordering at existing hook points:

1. **Session restore** — `AuthStartupPage` calls `AppBootstrapPipeline.RestoreSessionAsync(auth)` (same behavior as before, explicit name for audits).
2. **Shell ready** — `AppShell.OnAppearing` calls `OnShellReadyAsync(services, deepLinks)`:
   - `ILocalizationService.InitializeAsync()` (translation lookup surface),
   - `DeepLinkCoordinator.OnShellAppeared()` (consume pending warm / cold-stored links).

Cold start still shows `AuthStartupPage` first; map load and POI hydration remain in `MapPage` / `MapViewModel` as today — 7.2 only **sequences prerequisites** that were previously implicit.

### Bootstrap sequence (text)

```
App ctor
   └── AuthStartupPage
           └── [1] RestoreSessionAsync
           └── switch MainPage → AppShell or Login

AppShell.OnAppearing
   └── [2] Localization.InitializeAsync
   └── [3] DeepLinkCoordinator.OnShellAppeared
```

---

## Race condition prevention model

| Mechanism | Location | Role |
|-----------|----------|------|
| POI entry mutex | `PoiEntryCoordinator._handleMutex` | One entry pipeline at a time |
| Shell navigation mutex | `NavigationService._navGate` | One `GoToAsync` / modal transition at a time (pre-existing) |
| Translation in-flight map | `TranslationOrchestrator._inflight` | Share one `Task` per normalized key |
| Per-key translate lock | `PoiTranslationService._locks` | SQLite + provider single-flight |
| Focus mutex | `PoiFocusService._focusMutex` | Single writer to selection path from focus |
| Geofence gate | `GeofenceService._gate` | Non-reentrant location evaluation (pre-existing) |
| Deep link dispatch gate | `DeepLinkCoordinator._dispatchGate` | Single warm dispatch (pre-existing) |

---

## Event system integration safety (invocation only)

No changes to `IEventTracker`, `QueuedEventTracker`, or 6.7.x capture.

**Change:** Fewer duplicate **translation metric** emissions when multiple callers await the same orchestrated translation (dedup joiners no longer emit `Requested`).

QR scan analytics remain a **single** `Track` per successful navigation inside `PoiEntryCoordinator` (unchanged call site count per success).

---

## Files touched (7.2)

- `Services/PoiEntryCoordinator.cs` — mutex + duplicate-before-mutation + shared suppression helper
- `Services/AppBootstrapPipeline.cs` — new ordering helper
- `Views/AuthStartupPage.xaml.cs` — session restore via pipeline
- `AppShell.xaml.cs` — store `IServiceProvider`; Shell-ready pipeline
- `Services/PoiFocusService.cs` — focus mutex
- `Services/GeofenceService.cs` — same-POI-as-selection suppression
- `Services/TranslationOrchestrator.cs` — `Requested` only for leaders
- `ViewModels/QrScannerViewModel.cs` — raw payload debounce + reset on page appearing
