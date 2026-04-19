# Contract drift guard (6.7.3)

This phase adds **governance-only** enforcement: CI and a small `SchemaDiffChecker` tool compare the **immutable snapshot** with the API DTO, MAUI source files, a **golden** JSON document, and a **JSON Schema** property surface. Runtime business logic, serialization converters, and ingestion rules from 6.7.2 are **not** changed here.

## Goals

- Treat `contract-snapshots/EventContractV1.snapshot.json` as the **single source of truth** for the v1 wire shape (field names, nullability hints, enum wire values, and version metadata pointers).
- Fail fast when **MAUI**, **TranslationEvents.Api**, or **schema artifacts** diverge from that snapshot.
- Block **silent** JSON contract evolution on v1: any new `jsonName` on the DTO or any property missing from the snapshot fails the checker.

## Schema diff strategy

The `SchemaDiffChecker` console app (`tools/SchemaDiffChecker`) performs these checks:

1. **Version lock** — Reads `Models/EventContractV1.cs` and `TranslationEvents.Api/Models/EventContractV1.cs` and requires `Version` to equal `snapshot.contractVersion` (today: `v1`).
2. **DTO ↔ snapshot** — Reflects `TranslationEventDto` JSON names (`[JsonPropertyName]` where present, otherwise camelCase) and compares:
   - Field set equality (detects **missing fields**, **extra fields**, and **renames** expressed as add/remove pairs).
   - **Wire kind** alignment (`string`, `integer`, `number`, `boolean`) derived from CLR types.
   - **Nullability** alignment using `NullabilityInfoContext` vs `field.allowsNull` in the snapshot.
3. **Enum wire values (API)** — Serializes `EventActionKind`, `EventGeoSource`, and `EventUserTier` with the same options as `TranslationEvents.Api/Program.cs` (`JsonStringEnumConverter` + camelCase policy) and compares the distinct string values to `snapshot.enums`.
4. **MAUI parity (source-level)** — Without referencing the MAUI workload in CI, verifies:
   - Each `mauiProperty` from the snapshot appears on `TranslationEvent` in `Models/TranslationEvent.cs`.
   - Each enum wire string in the snapshot appears as a literal in `Models/AnalyticsActionKindNormalizer.cs` (action) and `Models/AnalyticsJsonConverters.cs` (geo write path), so **MAUI and API cannot drift in JSON strings** without updating the snapshot.
5. **Golden document** — `EventContractV1.golden.json` must contain **exactly** the keys declared in the snapshot, and `contractVersion` must match the snapshot version.
6. **JSON Schema surface** — `EventContractV1.schema.json` root `properties` keys must match the snapshot field set (documentation + secondary guard against property-name drift).

Structured output is written to `contract-snapshots/contract-schema-report.md` (generated; ignored by git). CI uploads it as a workflow artifact.

## CI pipeline design

Workflow: `.github/workflows/validate-contract-schema.yml`

| Trigger | Behavior |
| --- | --- |
| `pull_request` | Runs checker; **blocks merge** if the job fails (branch protection should require this workflow). |
| `push` to `main` / `master` | Same validation on the integration branch. |
| `release` (`published`) | Same validation as part of release hygiene. |
| `workflow_dispatch` | Manual re-run. |

Steps: checkout → setup .NET 10 → `dotnet run --project tools/SchemaDiffChecker/...` → upload `contract-schema-report.md` as an artifact (on success **or** failure so failures are diagnosable).

## Snapshot format (`EventContractV1.snapshot.json`)

Top-level fields:

| Field | Purpose |
| --- | --- |
| `contractId` | Human identifier (`EventContractV1`). |
| `contractVersion` | Must match `EventContractV1.Version` in MAUI and API. |
| `snapshotToolingVersion` | Version of the snapshot document shape for tooling (increment if the JSON layout changes). |
| `fields[]` | Each wire field: `jsonName`, `mauiProperty`, `wireKinds[]`, `allowsNull`. |
| `enums` | Map of logical enum groups to **exact** JSON string values allowed on the wire for v1. |
| `mauiSources` | Relative paths used for MAUI string/property checks. |
| `compatibility` | Static risk matrix and notes surfaced in the markdown report. |

**Renames** are detected as: snapshot still lists old `jsonName` while DTO exposes a new name (missing + extra errors). There is no silent rename pass-through.

## Failure conditions (non-zero exit)

The build / job fails when any of the following are true:

- Snapshot, golden, or schema file is missing or unreadable.
- MAUI or API `EventContractV1.Version` does not match `snapshot.contractVersion`.
- `TranslationEventDto` JSON properties are not **exactly** the snapshot field set.
- Wire kind or nullability disagrees with the snapshot for any shared field.
- API-serialized enum strings disagree with `snapshot.enums`.
- MAUI source checks fail (property or required string literal missing).
- Golden JSON keys or `contractVersion` disagree with the snapshot.
- JSON Schema `properties` keys disagree with the snapshot.

## Versioning enforcement rules

1. **No silent v1 evolution** — Adding a DTO property without updating the snapshot fails (extra JSON name). Removing a snapshot field without removing it from the DTO fails (snapshot expects field on DTO).
2. **Contract version** — If the wire contract changes in a breaking way for v1 consumers, **do not** mutate v1 in place: introduce **`EventContractV2`**, new snapshot files, and a new ingestion path, per product policy.
3. **Non-breaking additive fields** — Still require snapshot + golden + schema updates and an explicit decision (often a **new contract version** for analytics/Mongo consistency). The checker intentionally treats **any** DTO property not in the snapshot as an error to force an explicit snapshot edit.

## Artifacts beside the snapshot

| File | Role |
| --- | --- |
| `EventContractV1.golden.json` | Minimal valid payload; key set must match snapshot. |
| `EventContractV1.schema.json` | Draft 2020-12 style schema; property keys must match snapshot. |
| `contract-schema-report.md` | Generated diff-style report for CI artifacts. |

## Local command

From the repository root:

```bash
dotnet run --project tools/SchemaDiffChecker/SchemaDiffChecker.csproj --configuration Release -- --repo-root . --out contract-snapshots/contract-schema-report.md
```

Exit code `0` means no drift; non-zero means the job should fail in CI.
