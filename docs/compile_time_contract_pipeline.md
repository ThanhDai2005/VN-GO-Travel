# Compile-time contract pipeline (6.7.4)

## Dependency graph

```
ContractDefinition (Core/EventContractV1.cs)  ← sole manual contract text
        ↑
        │ AdditionalFile + build order (ProjectReference ReferenceOutputAssembly=false)
        │
Contracts.Generated ─────────────────────────► referenced by MAUI (MauiApp1) + TranslationEvents.Api
        ↑
        │ OutputItemType=Analyzer
        │
ContractSourceGenerator (Roslyn IIncrementalGenerator)
```

## Build pipeline (text diagram)

```
dotnet build Contracts.Generated
    │
    ├─► ContractGenerationTask (spec file exists?)
    │         └─► fail if missing
    │
    ├─► ContractDefinition.dll (validates spec compiles as C#)
    │
    ├─► ContractSourceGenerator.dll (analyzer)
    │
    └─► C# compiler + source-generated:
            EventContractV1Dto, enums, validator, JsonSchema const

dotnet build TranslationEvents.Api
    └─► references Contracts.Generated.dll (uses GeneratedContract.*)

dotnet build MauiApp1
    └─► references Contracts.Generated.dll
    └─► excludes sibling project sources from compile globs
```

## Generation order (logical)

1. **Parse** `EventContractV1.cs` (AdditionalFile) → `ContractSpec` model.  
2. **Emit enums** (member order = CLR numeric order).  
3. **Emit DTO** (`JsonPropertyName` per field).  
4. **Emit validator** (ingestion rules aligned with previous manual validator).  
5. **Emit JSON schema** string (draft 2020-12, `additionalProperties: false`, enums + required list).

If step 1 fails, steps 2–5 do not run and the build errors.

## Failure modes

| Failure | Symptom |
| --- | --- |
| Spec file missing | MSBuild error from `ContractGenerationTask` |
| Spec syntax not matching parser expectations | `VNT7001` diagnostic, empty generated output, compile errors for missing `GeneratedContract` types |
| Enum / field typo in spec | Generator may still parse; wrong wire shape caught by tests or CI snapshot checker |
| MAUI includes sibling `.cs` trees | Duplicate attribute / missing ASP.NET references → fix `Compile Remove` globs in `MauiApp1.csproj` |

## Versioning strategy

- **Spec constants** `Version` / `VersionPropertyName` are parsed and re-emitted into `GeneratedContract.EventContractV1`.
- **Breaking evolution**: add `EventContractV2.cs` (or a versioned table inside a new spec module), a second generator or parameterized generator pass, and new DTO type names—do not silently alter V1 rows consumers rely on.

## CI (6.7.3) role

Workflow `validate-contract-schema` is **unchanged** in intent: it still runs `SchemaDiffChecker` against `contract-snapshots/*.json`. After 6.7.4 it validates:

- `EventContractV1Dto` from **generated** assembly  
- Version string from **ContractDefinition** spec file  
- MAUI sources for literals and `TranslationEvent` properties  

Treat this as regression insurance on top of compiler-enforced generation.

## Local commands

```bash
dotnet build Contracts.Generated/Contracts.Generated.csproj -c Release
dotnet build TranslationEvents.Api/TranslationEvents.Api.csproj -c Release
dotnet run --project tools/SchemaDiffChecker/SchemaDiffChecker.csproj -- --repo-root .
```
