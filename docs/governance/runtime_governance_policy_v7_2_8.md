# Runtime governance policy — PCGL v7.2.8

This policy governs **changes and operations** around the MAUI runtime stack (7.2.3–7.2.8). It does **not** alter application runtime behavior by itself.

---

## 1. Authority boundaries (non-negotiable)

| Concern | Single authority | Rule |
|---------|------------------|------|
| Global GPS sample → `AppState.CurrentLocation` | **GAK** (`IGeofenceArbitrationKernel.PublishLocationAsync`) | Never assign `CurrentLocation` elsewhere. |
| Map selection → `AppState.SelectedPoi` | **MSAL** (`IMapUiStateArbitrator` → `CommitSelectedPoiForUi`) | Never assign `SelectedPoi` outside MSAL commit path. |
| Shell / modal navigation | **`INavigationService`** | Route all transitions through the service implementation. |
| Geofence evaluation | **`IGeofenceService`** invoked from **GAK** only | Do not call `CheckLocationAsync` from ad-hoc producers. |

---

## 2. Layer roles

| Layer | May change product behavior? | Notes |
|-------|-------------------------------|-------|
| **GAK** | Only via deliberate product change | Requires architecture review + regression on GPS/geofence. |
| **MSAL** | Only via deliberate product change | Requires UX + selection regression. |
| **RDGL** | DEBUG thread checks; CI grep | Do **not** disable CI grep rules; do not remove `CommitSelectedPoiForUi` gate without replacement. |
| **ROEL** | Decorators + telemetry only | Must stay non-blocking; no synchronous heavy work on hot paths. |
| **PCSL** | **DEBUG-only** registration | Never enable chaos in production or store builds. |
| **PCGL** | Governance artifacts + evaluator | Evaluator is **pure**; inputs come from CI/harness, not silent auto-wiring. |

---

## 3. Production safety rules

1. **Never bypass GAK** for location truth (no direct `CurrentLocation` writes).  
2. **Never bypass MSAL** for UI selection (no direct `SelectedPoi` writes outside `CommitSelectedPoiForUi`).  
3. **Never mutate** `AppState` selection/location from background threads without the same marshaling pattern as today’s kernels.  
4. **Never disable** RDGL-related CI checks without explicit governance sign-off.  
5. **Never enable PCSL** chaos in production or release pipelines intended for end users.  
6. **ROEL** must remain bounded-channel, non-blocking, best-effort.  

---

## 4. Rollout safety

- **Pre-merge:** RDGL grep suite + contract/tests as already defined in repo.  
- **Pre-release:** Run PCSL chaos suites on **DEBUG** builds; collect `ChaosValidationEngine` + ROEL snapshots; feed `ProductionReadinessEvaluator`.  
- **Go / No-Go:** Use `ProductionState`: **Blocked** stops release; **Degraded** requires risk owner sign-off; **Ready** clears standard release.

---

## 5. Strict guarantee

This governance document introduces **no runtime behavior changes**. It defines **how humans and CI** must treat the existing runtime architecture.
