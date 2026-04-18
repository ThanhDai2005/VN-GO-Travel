# Zero-drift contract architecture (6.7.4)

This phase introduces **compile-time contract generation**: a single manually maintained specification drives generated wire types, validation, and JSON schema text. MAUI and the ingestion API both consume the same generated assembly (`Contracts.Generated`). CI drift checks from 6.7.3 remain as a **secondary** guard; the primary guard is that **incorrect or divergent DTOs cannot compile** because they are not authored by hand.

## Before / after

| Aspect | 6.7.3 (CI-governed) | 6.7.4 (compiler-governed) |
| --- | --- | --- |
| Wire DTO | Handwritten `TranslationEventDto` (API) vs `TranslationEvent` (MAUI) | Single generated `EventContractV1Dto` in `GeneratedContract` |
| Enums | Duplicated `EventActionKind` / `AnalyticsActionKind`, etc. | Single generated `EventActionKind`, `EventGeoSource`, `EventUserTier` |
| Version constants | Duplicated `EventContractV1` in MAUI + API | Generated `GeneratedContract.EventContractV1` + spec in `ContractDefinition` |
| Validation | Handwritten `EventContractValidator` | Generated `EventContractValidator` (same rules as pre-6.7.4) |
| JSON schema | Hand-maintained `contract-snapshots/EventContractV1.schema.json` | Generated `EventContractV1JsonSchema.Draft202012` (plus optional snapshot file for CI parity) |
| Drift prevention | CI `SchemaDiffChecker` + snapshot | **Compile-time**: generator must succeed; **CI** still runs checker |

## Source generator architecture

1. **`ContractDefinition`** (`ContractDefinition/Core/EventContractV1.cs`)  
   The **only** manually edited contract source. It declares:
   - `Version` / `VersionPropertyName` string constants  
   - `Fields`: `WireField` rows (JSON name, CLR kind, nullability, DTO property name, optional enum type name)  
   - `Enums`: `WireEnum` blocks with `WireEnumMember` (CLR name + exact JSON string)

2. **`ContractSourceGenerator`** (`ContractSourceGenerator/`)  
   Roslyn `IIncrementalGenerator` registered on `Contracts.Generated`. It reads `EventContractV1.cs` as an **AdditionalFile**, parses `Fields` / `Enums` / constants with the Roslyn syntax APIs, and emits one compilation unit: `GeneratedContract.EventContractV1.g.cs`.

3. **`Contracts.Generated`** (`Contracts.Generated/`)  
   Class library referenced by **MAUI** and **TranslationEvents.Api**. It has no hand-written contract types—only the analyzer reference and `AdditionalFiles` link to the spec. A `ContractGenerationTask` MSBuild target fails the build if the spec file is missing.

## Generated artifacts map

| Output (in `GeneratedContract` namespace) | Role |
| --- | --- |
| `EventContractV1` | `Version`, `VersionPropertyName` |
| `EventActionKind`, `EventGeoSource`, `EventUserTier` | Wire enums (numeric order follows spec member order) |
| `EventContractV1Dto` | System.Text.Json DTO with `[JsonPropertyName]` |
| `EventContractValidator` | Ingestion validation (`GetRejectReason`) |
| `EventContractV1JsonSchema` | `Draft202012` raw string literal (JSON Schema draft 2020-12) |

## Compile-time enforcement model

- **Missing spec** → `ContractGenerationTask` error before `CoreCompile`.
- **Invalid spec syntax** → generator diagnostic `VNT7001`, no generated source, compilation fails.
- **MAUI project layout**: because `MauiApp1.csproj` lives at the repo root, sibling folders (`TranslationEvents.Api`, `ContractDefinition`, `ContractSourceGenerator`, `Contracts.Generated`, `tools`) are excluded from MAUI compile globs so analyzer/API sources are not compiled into the app.

## Migration path from 6.7.3 → 6.7.4

1. Introduce `ContractDefinition`, `ContractSourceGenerator`, `Contracts.Generated`.
2. Point MAUI + API `ProjectReference` at `Contracts.Generated` only.
3. Remove handwritten API DTO / enums / `EventContractV1` / validator; remove MAUI `EventContractV1.cs` and wire enums file; align MAUI domain types to `GeneratedContract` enums while **keeping** existing JSON converters and normalizers (same wire strings).
4. Update `SchemaDiffChecker` to reflect `EventContractV1Dto` from `Contracts.Generated` and version checks from `ContractDefinition/Core/EventContractV1.cs`.
5. Update `contract-snapshots/EventContractV1.snapshot.json` `mauiSources.eventContractVersion` to the contract spec path.
6. Keep `.github/workflows/validate-contract-schema.yml` as a secondary safety net.

## Versioning rule (unchanged policy)

- **V1** is locked at the spec: changing wire shape requires editing `ContractDefinition/Core/EventContractV1.cs` and letting the generator propagate; breaking changes should introduce **EventContractV2** (new spec file + new generator pass or versioned tables), not silent in-place drift.

## Optional next steps

- Add a CI step that compares `EventContractV1JsonSchema.Draft202012` to `contract-snapshots/EventContractV1.schema.json` (or generate the snapshot from a one-off tool).
- Publish `Contracts.Generated` as a NuGet package for external consumers (Mongo ingest workers, dashboards).
