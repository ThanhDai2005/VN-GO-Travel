# Production certification report — PCGL v7.2.8

**Document type:** Certification & governance (no runtime code paths modified by this file).  
**Evaluator:** `MauiApp1.Services.Governance.ProductionReadinessEvaluator` (pure function of `ProductionReadinessInput`).

---

## 1. System certification status

| Pillar | Status | Evidence / condition |
|--------|--------|-------------------------|
| **Deterministic** | **YES** *(when invariants hold)* | GAK single ingress for `CurrentLocation`; MSAL single commit for `SelectedPoi`; RDGL CI grep + DEBUG guard per v7.2.5 doc. |
| **Observable** | **YES** *(ROEL enabled)* | ROEL decorators + channel + ring + DEBUG NDJSON per v7.2.6. |
| **Chaos-resilient** | **YES** *(when PCSL harness passes)* | PCSL DEBUG-only; validation + MSAL/GAK unchanged per v7.2.7. |
| **Production-ready** | **CONDITIONAL** | Must equal **`ProductionState.Ready`** from evaluator with real CI/harness inputs; otherwise **Degraded** or **Blocked**. |

### Evaluator mapping (summary)

| Condition | `ProductionState` |
|-----------|-------------------|
| `RdglInvariantViolationCount > 0` OR `CiCrossLayerWriteChecksGreen == false` | **Blocked** |
| PCSL chaos incomplete / ROEL high drops / ROEL high anomalies / any PCSL validation issue | **Degraded** |
| Otherwise | **Ready** |

Constants: `RoelDropDegradedThreshold = 50`, `RoelAnomalyDegradedThreshold = 200` (tune per fleet telemetry).

---

## 2. Layer summary (7.2 stack recap)

| Version | Tag | Responsibility |
|---------|-----|------------------|
| 7.2.3 | **GAK** | Location truth + serialized geofence evaluation |
| 7.2.4 | **MSAL** | UI selection truth |
| 7.2.5 | **RDGL** | Invariant enforcement + regression guard |
| 7.2.6 | **ROEL** | Observability + passive efficiency signals |
| 7.2.7 | **PCSL** | DEBUG chaos / resilience validation |
| 7.2.8 | **PCGL** | Certification, governance policy, handover docs, readiness evaluator |

---

## 3. Risk acceptance statement

**The system is safe for production deployment under the defined invariants and governance constraints**, provided that:

1. Release builds **do not** register PCSL chaos decorators.  
2. RDGL CI checks remain mandatory for changes touching `AppState` write surfaces.  
3. ROEL remains non-blocking and bounded.  
4. Any **Degraded** readiness outcome is reviewed by a runtime owner before wide rollout.

Residual risks (e.g. platform-specific navigation edge cases, third-party map behavior) are outside PCGL but remain subject to normal QA.

---

## 4. Maintenance & handover model

| Activity | Allowed touchpoints |
|----------|---------------------|
| New GPS producer | Must call **`IGeofenceArbitrationKernel.PublishLocationAsync`** only. |
| New selection UX | Must call **`IMapUiStateArbitrator`** with an appropriate `MapUiSelectionSource`. |
| New navigation entry | **`INavigationService`** only. |
| Telemetry / ops | ROEL decorators, `RuntimeTelemetryEventKind`, thresholds — **no** kernel edits for “logging”. |
| Stress validation | PCSL **DEBUG** only; document scenarios in `docs/chaos/`. |
| Release certification | Populate `ProductionReadinessInput` from CI + chaos + ROEL counters → `Evaluate`. |

**Forbidden without architecture review:** direct `AppState.CurrentLocation` / `SelectedPoi` writes; direct `CheckLocationAsync`; disabling RDGL grep; PCSL in Release.

**Debugging:** see [handover/system_handover_guide_v7_2.md](handover/system_handover_guide_v7_2.md) and [replay/README.md](replay/README.md).

---

## 5. Documentation index (PCGL)

- Master index: [README.md](README.md)  
- Governance policy: [governance/runtime_governance_policy_v7_2_8.md](governance/runtime_governance_policy_v7_2_8.md)  
- Handover: [handover/system_handover_guide_v7_2.md](handover/system_handover_guide_v7_2.md)  
- Architecture hub: [architecture/README.md](architecture/README.md)

---

## 6. STRICT GUARANTEE SECTION

**This layer (PCGL v7.2.8) introduces no runtime behavior changes.** It adds governance artifacts, a **pure** readiness evaluator, DI registration of that evaluator (inactive until explicitly invoked), and documentation for production readiness and long-term maintainability. GAK, MSAL, RDGL, ROEL, and PCSL **logic and registration patterns** for those layers are **unchanged** by PCGL deliverables.

---

## 7. Sign-off (template)

| Role | Name | Date | Notes |
|------|------|------|-------|
| Runtime architect | | | |
| QA lead | | | |
| Product owner | | | |
