# Governance & certification — PCGL (7.2.8)

| Document | Purpose |
|----------|---------|
| [runtime_governance_policy_v7_2_8.md](runtime_governance_policy_v7_2_8.md) | Operational rules, safety, rollout |
| [../production_certification_report_v7_2_8.md](../production_certification_report_v7_2_8.md) | Certification matrix, risk acceptance, maintenance model |

## Code (evaluation only — no runtime mutation)

- `MauiApp1.Services.Governance.ProductionReadinessEvaluator` — deterministic `ProductionState` from `ProductionReadinessInput`  
- `MauiApp1.Services.Governance.RuntimeGovernanceRules` — canonical policy strings for CI/docs alignment
