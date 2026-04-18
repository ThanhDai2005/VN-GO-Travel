# Flow Invariant Report

**Repository:** VN-GO-Travel-D (MAUI client + related services; admin/web excluded from execution trace unless noted)  
**Role:** Runtime architecture validation — no feature proposals, only invariants vs. implementation.  
**Date:** 2026-04-18  

---

## 1. Executive Summary

The MAUI client has a **clear intended authority** for POI entry (`PoiEntryCoordinator` + `INavigationService`) and **good patterns** in several subsystems (hydration replacing `Pois` on the main thread, language switch snapshot + refresh, narration `SyncUiAsync` on main thread, 7.2 coordinator mutex + geofence/UI dedupe). However, **two independent location/geofence drivers** and **main-thread violations for `AppState` updates from the map tracking loop and background location loop** break strict threading and single-authority invariants for location-driven UI.

| Metric | Value |
|--------|--------|
| **System stability score (0–100)** | **62** |
| **Risk level** | **MEDIUM** (elevated to **HIGH** if map auto-select + background loop run together on production devices under load) |

**Validity vs. success criteria (strict):** The system is **not** fully valid under the stated criteria: there are **dual drivers** for location/geofence-related work, and **non–UI-thread mutations** of UI-bound state (`SelectedPoi`, `CurrentLocation`) from at least one periodic path.

---

## 2. Validated Flow Graphs (as implemented)

### 2.1 QR flow

```
QrScannerPage / manual
    → QrScannerViewModel.SubmitCodeAsync (VM lock + 7.2 raw debounce)
    → IPoiEntryCoordinator.HandleEntryAsync (7.2 Semaphore — single flight)
        → IQrScannerService.ParseAsync
        → [secure] API merge + NavigateByCodeAsync
        → [plain] NavigateByCodeAsync
    → INavigationService.NavigateToAsync (NavigationService → Shell.GoToAsync on main thread)
    → Map or PoiDetail route
Map: ApplyQueryAttributes → RequestFocusOnPoiCode → (later) FocusOnPoiByCodeAsync (7.2 mutex)
    → optional PlayPoiAsync → TTS
```

**Authority:** Coordinator + navigation service align with “single navigation gate” for **route changes**. **Residual competition:** map query focus + pin selection + auto-tracking (below) can still overlap **selection/narration**, not Shell routes.

### 2.2 Geofence flow (two inputs)

**Path A — `BackgroundTaskService.RunLocationLoopAsync`**

```
StartServices → Task.Run loop (5s delay, CancellationToken)
    → GetCurrentLocationAsync
    → _appState.CurrentLocation = loc   // NOT marshaled to main thread
    → IGeofenceService.CheckLocationAsync(loc)
```

**Path B — `MapPage.StartTrackingAsync` + `MapViewModel.UpdateLocationAsync`**

```
PeriodicTimer 5s → UpdateLocationAsync
    → MainThread: _appState.CurrentLocation = location
    → IGeofenceService.CheckLocationAsync(location)
```

**Path C — geofence internals**

```
GeofenceService.CheckLocationAsync (Semaphore TryWait 0)
    → MainThread snapshot: _appState.Pois.ToList()
    → distance / cooldown / selection match (7.2)
    → IAudioPlayerService.SpeakAsync (proximity path — not PoiNarrationService)
```

### 2.3 Translation flow

```
On-demand:
    TranslationOrchestrator.RequestTranslationAsync (in-flight dedupe + metrics)
    → IPoiTranslationService.GetOrTranslateAsync (per-key SemaphoreSlim + cache path)

PoiFocus / Narration:
    → RequestTranslationAsync or GetOrTranslateAsync inside gates

Background preloader:
    RunPreloaderLoopAsync returns immediately (disabled); unreachable while-loop exists (dead code)
```

### 2.4 Navigation flow

```
All Shell GoToAsync: Services/NavigationService.cs only
Callers: PoiEntryCoordinator, ViewModels/Pages via INavigationService
Shell.Current read-only elsewhere (DeepLinkCoordinator, PoiDetailViewModel resolve page, diagnostics)
```

**Doc drift note:** `docs/documentation_analysis.md` still claims `PoiEntryCoordinator` calls `Shell.Current.GoToAsync` directly; **current code uses `_navService.NavigateToAsync`** (`Services/PoiEntryCoordinator.cs`).

### 2.5 App startup / hydration / localization

```
App → AuthStartupPage → AppBootstrapPipeline.RestoreSessionAsync
    → MainPage = AppShell | Login stack
AppShell.OnAppearing → AppBootstrapPipeline.OnShellReadyAsync
    → ILocalizationService.InitializeAsync
    → DeepLinkCoordinator.OnShellAppeared
Map first use → PoiHydrationService.LoadPoisAsync (gate) → RefreshPoisCollectionAsync (main thread)
```

---

## 3. Invariant Table

| ID | Invariant | Status | Severity | Evidence |
|----|-----------|--------|----------|----------|
| N1 | Only one **Shell routing** implementation; no `GoToAsync` outside `NavigationService` | **SATISFIED** | — | `grep GoToAsync` → only `Services/NavigationService.cs` |
| N2 | POI entry navigation goes through **serialized** `INavigationService` | **SATISFIED** | — | `PoiEntryCoordinator` uses `_navService.NavigateToAsync` |
| N3 | No **parallel Shell navigations** for the same user gesture | **PARTIAL** | 🟡 | `NavigationService` rejects concurrent nav; multiple **call sites** can still queue sequential navigations (QR + deep link), which is acceptable but not “single semantic trigger” |
| T1 | `AppState.Pois` **replacement** on UI thread | **SATISFIED** | — | `PoiHydrationService.RefreshPoisCollectionAsync` uses `MainThread.InvokeOnMainThreadAsync` |
| T2 | **Indexing / mutation** of `AppState.Pois` from narration | **SATISFIED** | — | `PoiNarrationService.SyncUiAsync` wraps mutations in `MainThread.InvokeOnMainThreadAsync` |
| T3 | **Enumeration** of `AppState.Pois` off UI thread only from **snapshots** taken on UI thread | **MOSTLY SATISFIED** | 🟡 | `GeofenceService`, `LanguageSwitchService`, `MapPage` snapshot pattern; **violation:** `MapPage` assigns `SelectedPoi` off UI thread (see V1) |
| T4 | `AppState.SelectedPoi` / bound props updated on **UI thread** | **VIOLATED** | 🔴 | `Views/MapPage.xaml.cs` `StartTrackingAsync`: `_vm.SelectedPoi = nearest.Poi` / `null` outside `MainThread` (lines ~320–342) |
| T5 | `AppState.CurrentLocation` updated on **UI thread** | **VIOLATED** | 🔴 | `Services/BackgroundTaskService.cs` ~91: `_appState.CurrentLocation = loc` inside background loop without `MainThread` |
| B1 | Background periodic loops use **CancellationToken** and app lifecycle stop | **SATISFIED** | — | `RunLocationLoopAsync`: `while (!ct.IsCancellationRequested)`; `StopServices` cancels CTS |
| B2 | No **unbounded** `while(true)` without exit on cancel | **PARTIAL** | 🟡 | `QueuedEventTracker.FlushAsync`: `while (true)` until buffer empty — exits on `remaining == 0` or flush failure; uses `cancellationToken` on waits **but** loop itself is not directly `ct`-checked each iteration (bounded by buffer drain) |
| B3 | No hidden live background mutation of **Pois** | **SATISFIED** | — | Preloader loop **disabled** (`return` before `while`) |
| F1 | **Single** driver for “periodic location → geofence” | **VIOLATED** | 🔴 | **Two** 5s-class loops: `BackgroundTaskService` + `MapPage` `PeriodicTimer` |
| F2 | QR / deep link → **one** coordinator pipeline for route + dedupe | **SATISFIED** (post–7.2) | — | `PoiEntryCoordinator` mutex + duplicate suppression |
| F3 | Map QR handoff: **one** of navigation **or** redundant focus must not double-narrate | **PARTIAL** | 🟡 | 7.2 geofence vs selection helps; map auto-select + `PlayPoiAsync` still competes conceptually with geofence TTS |

---

## 4. Detected Violations

### 🔴 V1 — `SelectedPoi` mutated off the UI thread (map auto-tracking)

| Field | Value |
|-------|--------|
| **File** | `Views/MapPage.xaml.cs` |
| **Code behavior** | Inside `StartTrackingAsync`, after `await _timer.WaitForNextTickAsync(ct)`, code sets `_vm.SelectedPoi = nearest.Poi` and `_vm.SelectedPoi = null` **outside** `MainThread.InvokeOnMainThreadAsync` (assignments ~320–342; main-thread block used only for `ShowBottomPanelAsync`, `Map.MoveToRegion`, `PlayPoiAsync`). |
| **Invariant broken** | T4 — UI-bound `AppState` mutation on UI thread. |
| **Runtime consequence** | Cross-thread `INotifyPropertyChanged` / binding updates; intermittent crashes or corruption on some platforms; races with `DrawPois` / pin map logic. |

### 🔴 V2 — `CurrentLocation` mutated off the UI thread (background loop)

| Field | Value |
|-------|--------|
| **File** | `Services/BackgroundTaskService.cs` |
| **Code behavior** | `RunLocationLoopAsync` assigns `_appState.CurrentLocation = loc` on the thread pool after `GetCurrentLocationAsync`, with no `MainThread` marshal. |
| **Invariant broken** | T5; aligns with threading rules for observable/bindable state. |
| **Runtime consequence** | Same class as V1; `MapViewModel.UpdateLocationAsync` **does** set location on main thread — **inconsistent** threading model between two producers. |

### 🔴 V3 — Dual periodic location → geofence execution

| Field | Value |
|-------|--------|
| **Files** | `Services/BackgroundTaskService.cs` (`RunLocationLoopAsync`, ~5s); `Views/MapPage.xaml.cs` (`PeriodicTimer` 5s + `UpdateLocationAsync`); `ViewModels/MapViewModel.cs` (`UpdateLocationAsync`). |
| **Code behavior** | When `StartServices()` runs (e.g. `App.OnStart` / resume) **and** map tab has appeared, **both** loops can call `CheckLocationAsync` and update location on different cadences/threads. |
| **Invariant broken** | F1 — single authority for periodic location/geofence driving. |
| **Runtime consequence** | Duplicate geofence evaluations, extra battery/GPS use, harder-to-reason ordering; amplifies V2 and any cooldown/race edge cases. |

### 🟡 S1 — Unreachable preloader loop (structural / maintenance hazard)

| Field | Value |
|-------|--------|
| **File** | `Services/BackgroundTaskService.cs` |
| **Code behavior** | `RunPreloaderLoopAsync` returns immediately after `await Task.CompletedTask`; following `while (!ct.IsCancellationRequested)` is **unreachable** (compiler may warn CS0162). |
| **Invariant broken** | “Governed periodic tasks” clarity; not a runtime loop today. |
| **Runtime consequence** | Confusion during audits; risk of re-enabling without full thread review. |

### 🟡 S2 — `FlushAsync` unbounded `while (true)`

| Field | Value |
|-------|--------|
| **File** | `Services/QueuedEventTracker.cs` |
| **Code behavior** | `while (true)` drains buffer until empty or failed flush; uses `cancellationToken` on `_flushGate.WaitAsync` and `FlushOneBatchCoreAsync`. |
| **Invariant broken** | B2 strict reading (“no while(true) without cancellation”) — **partial**: loop is bounded by work but not each iteration `ct.ThrowIfCancellationRequested`. |
| **Runtime consequence** | Long flush could ignore cooperative cancel until between iterations; acceptable for dispose path but not ideal for strict token discipline. |

### 🟠 D1 — Documentation vs. runtime (design drift)

| Field | Value |
|-------|--------|
| **File** | `docs/documentation_analysis.md` |
| **Code behavior** | States `PoiEntryCoordinator` bypasses `NavigationService` with direct `Shell.GoToAsync`. |
| **Invariant broken** | Doc accuracy as reflection of architecture. |
| **Runtime consequence** | Mis-prioritized fixes or false confidence; **code path is corrected** in current `PoiEntryCoordinator`. |

### 🟠 D2 — “Single audio entry” vs. geofence

| Field | Value |
|-------|--------|
| **Files** | `Services/GeofenceService.cs`; `Services/PoiNarrationService.cs` (comments state single entry for POI narration) |
| **Code behavior** | Geofence path calls `IAudioPlayerService.SpeakAsync` directly; narration uses the same service through orchestration. |
| **Invariant broken** | Soft architectural invariant (“one narration policy owner”) — **by design** two call sites exist unless fully unified. |
| **Runtime consequence** | Mitigated in part by 7.2 selection match suppression; still a **conceptual dual path** to TTS. |

---

## 5. Root Cause Analysis

1. **Evolutionary split:** Location polling existed both in **map-local** UX (`PeriodicTimer`) and **global** `BackgroundTaskService`, likely for “works even when not on map tab” vs. “map-centric UX.” Without a single scheduler, **F1** and **V3** follow.

2. **Thread model inconsistency:** `MapViewModel.UpdateLocationAsync` correctly marshals `CurrentLocation`; `BackgroundTaskService` does not — **same property, two contracts** → **V2**.

3. **Async UI discipline gap:** `StartTrackingAsync` correctly uses `MainThread` for drawing and playback but treats **`SelectedPoi` as a plain setter** on the timer thread → **V1**.

4. **Documentation lag:** Older audit files describe pre-refactor navigation; **D1** undermines invariant reviews if not reconciled.

---

## 6. Fix Strategy (strict order — correctness only)

1. **Navigation / flow authority**  
   - Keep all `GoToAsync` inside `NavigationService`.  
   - Optionally document explicitly that **selection + narration** are separate from **Shell navigation** and may need a single “map interaction” policy (still correctness, not a feature).

2. **ObservableCollection / `AppState` thread safety**  
   - Marshal **all** `SelectedPoi` and `CurrentLocation` writes from `MapPage.StartTrackingAsync` and `BackgroundTaskService.RunLocationLoopAsync` to **MainThread** (or centralize updates in one service that enforces UI thread).  
   - Audit any remaining `_appState.*` assignments from `Task.Run` / timer callbacks.

3. **Background task governance**  
   - **Choose one** periodic owner for “location → geofence” when the map is active vs. global: either disable background loop while `MapPage` tracking runs, or remove duplicate timer from map and rely on background service **with** unified marshaling — goal is **F1**, not two independent timers.

4. **Duplicate event / evaluation suppression**  
   - After (3), re-validate geofence cooldown + 7.2 selection suppression under single driver.  
   - Ensure `CheckLocationAsync` is not invoked twice for the same GPS sample within one logical tick.

5. **ViewModel / page decomposition (structural, only where it fixes races)**  
   - Move “auto nearest POI selection + panel + play” into a small service or VM method that **always** applies UI mutations on `MainThread`, callable from the single location tick — reduces future copy-paste violations.

6. **Docs alignment**  
   - Update `documentation_analysis.md` (or add errata) so audits match `PoiEntryCoordinator` → `INavigationService` reality (**D1**).

---

## 7. Appendix — Files consulted (non-exhaustive)

- `Services/PoiEntryCoordinator.cs`, `Services/NavigationService.cs`, `Services/DeepLinkHandler.cs`, `Services/DeepLinkCoordinator.cs`  
- `Services/BackgroundTaskService.cs`, `Services/GeofenceService.cs`, `Services/PoiHydrationService.cs`, `Services/PoiFocusService.cs`, `Services/PoiNarrationService.cs`, `Services/LanguageSwitchService.cs`  
- `Services/QueuedEventTracker.cs`, `Services/TranslationOrchestrator.cs`, `Services/AppState.cs`  
- `Views/MapPage.xaml.cs`, `ViewModels/MapViewModel.cs`, `ViewModels/QrScannerViewModel.cs`  
- `docs/documentation_analysis.md`, `docs/runtime_flow_stabilization_7_2.md`  

---

*End of report.*
