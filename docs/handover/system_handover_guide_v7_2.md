# System handover guide — MAUI runtime v7.2

This guide is for engineers taking ownership of the **VN-GO Travel** MAUI client with the **7.2 runtime stack** (GAK → PCGL). It is **non-code** architecture prose plus operational pointers.

---

## 1. Architecture summary (one page)

The map runtime is organized as **strict authorities**:

1. **GAK (7.2.3)** — Every GPS sample from map or background loops enters **`IGeofenceArbitrationKernel.PublishLocationAsync`**. That path owns **`AppState.CurrentLocation`** updates and serializes calls into **`IGeofenceService.CheckLocationAsync`**.

2. **MSAL (7.2.4)** — Every change to **`AppState.SelectedPoi`** for map UI goes through **`IMapUiStateArbitrator`**, which commits via **`AppState.CommitSelectedPoiForUi`** (single physical writer).

3. **RDGL (7.2.5)** — DEBUG thread-affinity warnings on `CurrentLocation` / `SelectedPoi`; CI grep rules document forbidden cross-layer writes.

4. **ROEL (7.2.6)** — Decorators around GAK ingress, geofence service, MSAL, and navigation log **non-blocking** telemetry into a bounded channel + ring buffer (+ DEBUG NDJSON).

5. **PCSL (7.2.7)** — **DEBUG-only** outer decorators that can inject jitter, bursts, spam, and nav storms **ahead of ROEL** when explicitly armed. Release builds skip PCSL registration.

6. **PCGL (7.2.8)** — Governance docs + **`ProductionReadinessEvaluator`**: a **pure** function from explicit inputs (CI/harness) to **`ProductionState`** (`Ready` / `Degraded` / `Blocked`). It does not auto-wire into the live app.

**QR / navigation / TTS** business rules are unchanged by these layers; PCSL/ROEL sit outside product logic.

---

## 2. Runtime flow (GPS → UI → nav)

1. **GPS** → `PublishLocationAsync(producerId)` (map ~5s, background ~5s).  
2. **GAK** updates `CurrentLocation` on the UI thread, applies coalescing, then may invoke geofence.  
3. **Geofence** may read `SelectedPoi` to suppress duplicate narration; it does **not** own selection writes.  
4. **MSAL** applies selection when user, QR coordinator, focus, narration sync, or map auto-proximity requests a change.  
5. **Navigation** uses **`INavigationService`**; modal depth is mirrored to **`AppState.ModalCount`**.

For diagrams, see [../architecture/README.md](../architecture/README.md) and layer-specific PDFs/Markdown in `docs/`.

---

## 3. Key invariants (memorize)

- **One writer** for `CurrentLocation` (GAK path only).  
- **One commit path** for `SelectedPoi` (MSAL → `CommitSelectedPoiForUi`).  
- **One geofence evaluation pipeline** entry (`CheckLocationAsync` from GAK).  
- **ROEL never blocks** producers.  
- **PCSL never ships** in Release graph.

---

## 4. Debugging production issues (ROEL)

1. Prefer **logs** from `RuntimeTelemetryService` and structured app logging.  
2. On **DEBUG** builds, inspect `roel/telemetry.ndjson` and use **`RuntimeReplayEngine.BuildTextTimeline()`** to order events.  
3. Correlate **`LocationPublishCompleted`** vs **`GeofenceEvaluated`** counts to infer coalescing vs evaluation load.  
4. Correlate **`MsalApplyInvoked`** / **`UiStateCommitted`** pairs for selection churn.

---

## 5. Chaos testing (PCSL)

1. Use **DEBUG** build.  
2. `ChaosSimulationService.Arm(ChaosSimulationFlags.*, true)` — see [../production_chaos_simulation_layer_v7_2_7.md](../production_chaos_simulation_layer_v7_2_7.md).  
3. Run scripted scenarios; **`ChaosValidationEngine.ValidateRecent`** on `IRuntimeTelemetry`.  
4. **`Disarm()`** before manual QA to restore pass-through behavior.

---

## 6. Production safety (PCGL)

Read [../governance/runtime_governance_policy_v7_2_8.md](../governance/runtime_governance_policy_v7_2_8.md) and [../production_certification_report_v7_2_8.md](../production_certification_report_v7_2_8.md).

**Go / No-Go:** Build `ProductionReadinessInput` from metrics (RDGL violations = 0, CI grep green, ROEL drops/anomalies within thresholds, PCSL clean). Call **`ProductionReadinessEvaluator.Evaluate`**.

---

## 7. What NOT to touch (without full review)

| Do not | Why |
|--------|-----|
| Short-circuit **`PublishLocationAsync`** for “optimization” | Breaks GAK coalescing + single authority. |
| Set **`SelectedPoi`** or **`CurrentLocation`** from pages/services | Bypasses MSAL/GAK; breaks invariants. |
| Call **`CheckLocationAsync`** from new producers | Duplicates geofence evaluation semantics. |
| Add blocking I/O inside ROEL decorators | Violates non-blocking telemetry contract. |
| Register PCSL in Release | Forbidden by governance. |
| Remove **`CommitSelectedPoiForUi`** without a replacement single-writer | Reintroduces multi-writer races. |

---

## 8. What you MAY change (typical work)

- **Features** above the stack: new pages, API clients, UI layout — still must call **`INavigationService`**, **`IMapUiStateArbitrator`**, **`IGeofenceArbitrationKernel`** as today.  
- **New telemetry fields** in ROEL (additive, non-blocking).  
- **Evaluator thresholds** in `ProductionReadinessEvaluator` constants (with governance review).  
- **Docs** under `docs/` following the folder indexes in [../README.md](../README.md).

---

## 9. Contacts / process (fill in locally)

- **Runtime owner:** _TBD_  
- **Release approver for GAK/MSAL changes:** _TBD_  
- **CI owner for RDGL grep suite:** _TBD_
