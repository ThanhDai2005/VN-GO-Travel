# Docs Index (runtime-first)

Mục tiêu của thư mục `docs/` là phản ánh **đúng trạng thái hiện tại**. Khi có mâu thuẫn, ưu tiên:

1. **`SYSTEM_CURRENT_STATE.md`** — tóm tắt các stage đã làm, client (`admin-web`, `web`, MAUI), và việc còn lại.
2. **`../README.md`** (root) — bố cục monorepo và chạy nhanh từng phần.

## 0) MAUI runtime 7.2 stack (GAK → PCGL) — governance index

| Layer | Role | Doc |
|-------|------|-----|
| **7.2.3 GAK** | Location + geofence evaluation authority | [geofence_arbitration_kernel_design.md](geofence_arbitration_kernel_design.md), [geofence_arbitration_kernel_v7_2_3.md](geofence_arbitration_kernel_v7_2_3.md) |
| **7.2.4 MSAL** | UI selection (`SelectedPoi`) authority | [map_state_arbitration_layer_v7_2_4.md](map_state_arbitration_layer_v7_2_4.md) |
| **7.2.5 RDGL** | Invariant / regression guard | [runtime_determinism_guard_layer_v7_2_5.md](runtime_determinism_guard_layer_v7_2_5.md) |
| **7.2.6 ROEL** | Observability + passive efficiency | [runtime_observability_efficiency_layer_v7_2_6.md](runtime_observability_efficiency_layer_v7_2_6.md) |
| **7.2.7 PCSL** | DEBUG chaos / resilience validation | [production_chaos_simulation_layer_v7_2_7.md](production_chaos_simulation_layer_v7_2_7.md) |
| **7.2.8 PCGL** | Certification + governance + handover | [production_certification_report_v7_2_8.md](production_certification_report_v7_2_8.md), [governance/runtime_governance_policy_v7_2_8.md](governance/runtime_governance_policy_v7_2_8.md), [handover/system_handover_guide_v7_2.md](handover/system_handover_guide_v7_2.md) |
| **7.2.9 RBEL** | Runtime → business event bridge (design-only; no code) | [bridge/runtime_to_business_event_bridge_layer_rbel_spec.md](bridge/runtime_to_business_event_bridge_layer_rbel_spec.md) |

**Curated folders (indexes):** [architecture/README.md](architecture/README.md) · [bridge/README.md](bridge/README.md) · [observability/README.md](observability/README.md) · [chaos/README.md](chaos/README.md) · [governance/README.md](governance/README.md) · [flows/README.md](flows/README.md) · [replay/README.md](replay/README.md)

**Pre–7.3 baseline (single reconciliation):** [architecture_v7_2_system_reconciliation_baseline.md](architecture_v7_2_system_reconciliation_baseline.md) — truth matrix, risks, ROEL vs business gap, 7.3 attach boundary.

## 0b) 7.3 User intelligence (business layer — spec only)

| Release | Role | Doc |
|---------|------|-----|
| **7.3.0 UIS** | Ingestion, Mongo, identity, pipeline, admin analytics — **RBEL input only** | [intelligence/user_intelligence_system_v7_3_0_spec.md](intelligence/user_intelligence_system_v7_3_0_spec.md) |

**Index:** [intelligence/README.md](intelligence/README.md)

## 1) Runtime Contract (ưu tiên cao)

- [SYSTEM_CURRENT_STATE.md](SYSTEM_CURRENT_STATE.md) — handoff cho AI/dev và team.
- [00-system-overview.md](00-system-overview.md) — backend Node: layers, env, client surfaces.
- [05-admin-flow.md](05-admin-flow.md) — moderation + audit (Stage 4–5).
- [07-api-reference.md](07-api-reference.md) — catalog endpoint; login trả `{ success, data }`.
- [12-testing-guide.md](12-testing-guide.md) — `backend/tests/`, Jest + Supertest.

## 2) Chủ đề cốt lõi

- [01-architecture.md](01-architecture.md) … [04-owner-flow.md](04-owner-flow.md), [06-poi-lifecycle.md](06-poi-lifecycle.md)
- [02-auth-rbac.md](02-auth-rbac.md), [03-subscription.md](03-subscription.md)
- [08-error-model.md](08-error-model.md), [09-data-model.md](09-data-model.md), [10-business-rules.md](10-business-rules.md)
- [11-security-model.md](11-security-model.md), [13-developer-playbook.md](13-developer-playbook.md)

## 3) QR / Map / Planning (tham khảo)

- [QR_INTEGRATED_DOCUMENT.md](QR_INTEGRATED_DOCUMENT.md), [architecture.md](architecture.md), [known-issues.md](known-issues.md)
- [07_refactor_plan.md](07_refactor_plan.md), [PHASE6_PLAN.md](PHASE6_PLAN.md), [PRD_Culinary_Tourism_MVP.md](PRD_Culinary_Tourism_MVP.md)

---

*Các tài liệu QR nhỏ đã gom trong `QR_INTEGRATED_DOCUMENT.md` nếu có.*
