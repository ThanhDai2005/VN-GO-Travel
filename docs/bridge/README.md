# Bridge specifications (runtime → product)

Documents that define **interfaces and rules** between the frozen **7.2** runtime stack and future **7.3+** systems. **No** runtime code in this folder unless a future ADR moves an implementation spec here.

| Document | Role |
|----------|------|
| [runtime_to_business_event_bridge_layer_rbel_spec.md](runtime_to_business_event_bridge_layer_rbel_spec.md) | **RBEL (7.2.9)** — event taxonomy, EventContractV2, pipeline, 7.3 API contract (design-only) |
| [rbel_client_bridge_v7_3_1.md](rbel_client_bridge_v7_3_1.md) | **7.3.1 RBEL client bridge (MAUI)** — implemented **additive** runtime → 7.3.0 batch ingestion; **no** GAK/MSAL/NAV/GeofenceService/ROEL-decorator edits |

**Downstream:** [../intelligence/user_intelligence_system_v7_3_0_spec.md](../intelligence/user_intelligence_system_v7_3_0_spec.md) — **7.3.0 User Intelligence System** (ingestion, storage, identity, admin analytics).

**Related:** [../architecture_v7_2_system_reconciliation_baseline.md](../architecture_v7_2_system_reconciliation_baseline.md) · [../governance/runtime_governance_policy_v7_2_8.md](../governance/runtime_governance_policy_v7_2_8.md)
