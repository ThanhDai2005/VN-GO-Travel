# CI contract validation report (6.7.3)

This document describes how **continuous contract validation** works after introducing the drift guard, what fails in CI, and how enum and compatibility risks are classified.

## Drift detection flow (text diagram)

```
[Git: PR / main / release]
        │
        ▼
[checkout + setup-dotnet 10.x]
        │
        ▼
[dotnet run tools/SchemaDiffChecker]
        │
        ├─► Read contract-snapshots/EventContractV1.snapshot.json (source of truth)
        │
        ├─► Reflect TranslationEvents.Api TranslationEventDto (JSON names, types, nullability)
        │
        ├─► Serialize API enums with Program.cs-equivalent JsonSerializerOptions
        │
        ├─► Read MAUI Models/*.cs paths from snapshot (properties + enum string literals)
        │
        ├─► Validate golden JSON keys + contractVersion
        │
        └─► Validate JSON schema root.properties keys
        │
        ▼
[Write contract-snapshots/contract-schema-report.md]
        │
        ├─► exit 0 → pass
        └─► exit 1 → fail job (block merge when required check)
        │
        ▼
[upload-artifact: contract-schema-report.md]  (success or failure)
```

Workflow file: `.github/workflows/validate-contract-schema.yml`.

## Build failure scenarios

| Scenario | Example | Checker outcome |
| --- | --- | --- |
| **Missing field on DTO** | Snapshot lists `newField` but DTO has no matching JSON property | Error: snapshot field missing on DTO |
| **Silent new DTO property** | Developer adds `[JsonPropertyName("foo")]` without snapshot update | Error: DTO exposes JSON property not in snapshot |
| **Type / wire kind drift** | `durationMs` changes from `long` to `double` without snapshot | Error: wireKinds mismatch |
| **Nullability drift** | `eventId` becomes non-nullable reference type without snapshot | Error: allowsNull mismatch |
| **Version mismatch** | Code `Version = "v2"` but snapshot still `v1` | Error: MAUI/API version vs snapshot |
| **Enum wire change** | API `JsonStringEnumConverter` policy or enum member rename changes JSON | Error: API enum serialization mismatch |
| **MAUI enum literal missing** | Snapshot lists `deepLink` but normalizer no longer emits that string | Error: MAUI action wire source must contain literal |
| **Golden key mismatch** | Golden JSON omits `geoSource` | Error: golden missing key |
| **Schema property drift** | Schema adds property not in snapshot | Error: schema exposes unknown key |

## Enum mismatch cases

| Enum group | MAUI source of truth (strings) | API serialization | Snapshot key |
| --- | --- | --- | --- |
| `actionType` | `AnalyticsActionKindNormalizer.ToJsonName` + converter | `EventActionKind` + `JsonStringEnumConverter` | `enums.actionType` |
| `geoSource` | `GeoSnapshotSourceConverter.Write` | `EventGeoSource` + `JsonStringEnumConverter` | `enums.geoSource` |
| `userType` | `TranslationUserType` via `JsonStringEnumConverter` in MAUI JSON options | `EventUserTier` + `JsonStringEnumConverter` | `enums.userType` |

**Rule:** C# enum **names** may differ across assemblies, but **serialized JSON strings** must match the snapshot set exactly. CI fails if the API-produced set or MAUI source literals disagree with the snapshot.

## Compatibility risk matrix (governance)

These are **policy** rows carried in the snapshot and echoed in the markdown report; they complement automatic checks.

| Change | Severity | Typical mitigation |
| --- | --- | --- |
| Remove or rename `jsonName` | Breaking | `EventContractV2`, dual-write, migrate Mongo/dashboards |
| Optional (nullable) → required non-null on wire | Breaking | Version bump, coordinated producer/consumer rollout |
| Enum wire value change | Breaking | Keep readers tolerant or bump contract; never silent remap |
| Add `jsonName` without governance | Governance / breaking for locked v1 | Update snapshot + golden + schema **and** decide v1 vs v2 |

The tool emits **warnings** for some nullable vs non-nullable combinations that deserve human review (see report section **Warnings**).

## Enforcement status checklist

| Requirement | Status |
| --- | --- |
| Automated detection of schema / field set drift | Implemented (`SchemaDiffChecker` + snapshot vs DTO) |
| Build fails on contract drift | Implemented (non-zero exit; use as required CI check) |
| MAUI + API version aligned to snapshot | Implemented (`EventContractV1.Version`) |
| Enum JSON values enforced | Implemented (API serialization + MAUI literal scan vs snapshot) |
| Golden wire document key parity | Implemented |
| JSON Schema property surface parity | Implemented |
| Markdown report artifact in CI | Implemented (`upload-artifact`) |
| Silent DTO property addition blocked | Implemented (extra JSON name fails) |
| Version bump required for incompatible v1 change | Policy + version const check; structural changes require snapshot edit |

## Operational notes

- **Branch protection:** Mark `validate-contract-schema` as a required status check on the default branch so drift cannot merge silently.
- **Release pipelines:** Non-GitHub release systems should invoke the same `dotnet run` command and fail the stage on non-zero exit, then publish `contract-schema-report.md` as an artifact.
- **Extending checks:** Prefer extending the snapshot and golden/schema files first, then adjusting MAUI/API code under an explicit version story (`v1` vs `EventContractV2`).
