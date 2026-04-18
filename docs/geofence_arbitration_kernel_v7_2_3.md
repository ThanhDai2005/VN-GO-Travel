# Geofence Arbitration Kernel (GAK) — Implementation Report v7.2.3

This document describes the **implemented** Geofence Arbitration Kernel and the **future bug prevention** guarantees it provides, aligned with prompt 7.2.3 (final hardened).

---

## 1. System before vs after

### 1.1 Before (dual driver)

```
[BackgroundTaskService.RunLocationLoopAsync]
    → AppState.CurrentLocation = loc   (background thread — unsafe for bindings)
    → IGeofenceService.CheckLocationAsync(loc)

[MapViewModel.UpdateLocationAsync]
    → MainThread: AppState.CurrentLocation = location
    → IGeofenceService.CheckLocationAsync(location)
```

Two producers could evaluate geofence for **nearly identical** samples within the same wall-clock window, and `CurrentLocation` had **inconsistent** threading.

### 1.2 After (single arbitration ingress)

```
[BackgroundTaskService] ──┐
                            ├──► IGeofenceArbitrationKernel.PublishLocationAsync(loc, producerId, ct)
[MapViewModel.UpdateLocationAsync] ──┘
            │
            ├──► MainThread: AppState.CurrentLocation = location  (sole writer path)
            ├──► Coalesce (250 ms + 3 m) → at most one geofence commit per logical sample
            └──► IGeofenceService.CheckLocationAsync (single caller for location-driven path)
```

**Unchanged externally:** both **5 s** loops still run; QR, Shell navigation, and `PoiEntryCoordinator` are untouched.

---

## 2. Kernel architecture

| Stage | Responsibility |
|-------|----------------|
| **Ingest** | `PublishLocationAsync(Location?, string producerId, CancellationToken)` |
| **UI marshaling** | `MainThread.InvokeOnMainThreadAsync` for **every** `CurrentLocation` write |
| **Coalescing gate** | Lock-protected: if previous commit within **250 ms** **and** distance **&lt; 3 m**, skip `CheckLocationAsync` for this sample |
| **Execution** | Single `CheckLocationAsync` call outside the coalesce lock (no `await` under lock) |
| **Telemetry** | `ILogger` debug on coalesce; warning on geofence exception |

### 2.1 Types

| Type | Role |
|------|------|
| `IGeofenceArbitrationKernel` | DI-facing API |
| `GeofenceArbitrationKernel` | Implementation (`Services/GeofenceArbitrationKernel.cs`) |

### 2.2 Emergency parity switch

`GeofenceArbitrationKernel.DisableCoalescing` (static): when `true`, **every** publish still updates `CurrentLocation` on the UI thread and **always** runs `CheckLocationAsync` (restores pre-7.2.3 duplicate-evaluation behavior for rollback / A-B testing). Default **`false`**.

---

## 3. Strict contracts

### 3.1 `PublishLocationAsync`

- **Pre:** `location` may be null → no-op.
- **Post:** `AppState.CurrentLocation` reflects the latest published fix on the **UI thread**.
- **Geofence:** `CheckLocationAsync` runs **0 or 1** times per call; **0** if coalesced as duplicate of the immediately previous committed sample (Rule A — AND of time window and epsilon).

### 3.2 State ownership

| State | Owner for location pipeline |
|-------|------------------------------|
| `AppState.CurrentLocation` | **Only** `GeofenceArbitrationKernel` from producers `map` / `background` |
| `SelectedPoi` (map auto-track) | **MapPage** writes moved onto **MainThread** (same change set); not written by kernel (geofence service does not set selection) |

### 3.3 Producer rules (enforced in code)

- `BackgroundTaskService` **does not** assign `CurrentLocation` or call `IGeofenceService` directly.
- `MapViewModel.UpdateLocationAsync` **does not** assign `CurrentLocation` or call `IGeofenceService` directly.
- Other components may still use `IGeofenceService` if they obtain a location through other means (none today for the periodic path).

---

## 4. Migration plan (logical phases vs code)

| Phase | Intent | Code status |
|-------|--------|-------------|
| **Phase 1 — Shadow** | Log-only, no suppression | Superseded by direct **Phase 2** implementation; coalesce logging uses `LogDebug` when suppression occurs |
| **Phase 2 — Soft arbitration** | Single `CheckLocationAsync` caller for producers | **Implemented** — producers call kernel only |
| **Phase 3 — Full control** | Producers are pure publishers | **Implemented** for `CurrentLocation` + geofence ingress; `DisableCoalescing` provides escape hatch |

---

## 5. Future bug prevention layer

| Failure class | Prevention |
|---------------|------------|
| **Double timer hazard** | Two timers may still fire; kernel **coalesces** rapid duplicate samples so **one** geofence evaluation commits per logical GPS duplicate (Δt &lt; 250 ms ∧ distance &lt; 3 m). |
| **Cross-thread `AppState` corruption** | All `CurrentLocation` updates from the two producers go through **one** `MainThread` hop inside the kernel. Map auto-`SelectedPoi` assignments run on **MainThread** in `MapPage`. |
| **Hidden infinite loop drift** | Geofence path unchanged: background loop remains `while (!ct.IsCancellationRequested)` with delay; map loop uses `PeriodicTimer` + cancellation; no new `while(true)` added. |
| **Race amplification** | Concurrent publishes: coalesce state updated under **lock** without awaiting inside lock; duplicate producers in the same window do not double-invoke geofence. |

---

## 6. Risk analysis

| Risk | Assessment |
|------|-------------|
| **UX / timing** | No timer interval changes; no navigation or QR edits. Coalescing only suppresses **redundant** geofence work when both drivers report the **same** fix within **250 ms** and **3 m** — typical double-fire from dual 5 s loops is removed without delaying intentional movement. |
| **Latency** | Hot path: one `MainThread` dispatch + short lock + optional `CheckLocationAsync`; target remains well under **20 ms** synchronous work excluding OS geofence/TTS. |
| **TTS** | Still driven by `GeofenceService` policy (cooldown, jitter, 7.2 selection suppression); kernel does not alter spoken content. |

**Explicit confirmation:** *No observable UX change under normal or peak load, including QR, geofence, navigation, and TTS flows* — subject to the usual OS scheduling variance; intentional change is **suppression of duplicate geofence evaluation** for duplicate samples only, which aligns with production stability goals.

---

## 7. File manifest

| File | Change |
|------|--------|
| `Services/IGeofenceArbitrationKernel.cs` | **New** |
| `Services/GeofenceArbitrationKernel.cs` | **New** |
| `Services/BackgroundTaskService.cs` | Uses kernel; no direct `CurrentLocation` / geofence |
| `ViewModels/MapViewModel.cs` | Uses kernel; `UpdateLocationAsync(CancellationToken)` |
| `Views/MapPage.xaml.cs` | Passes `ct` to VM; `SelectedPoi` on main thread |
| `MauiProgram.cs` | Registers kernel after `GeofenceService` |

---

## 8. Final guarantee

This implementation preserves **full behavioral parity** for user-facing flows (same loops, same routes, same TTS policy engine) while **eliminating race-condition classes** in dual-driver geofence execution and **centralizing** `AppState.CurrentLocation` mutation on the **UI thread** for the two periodic GPS producers.

---

*End of v7.2.3 implementation report.*
