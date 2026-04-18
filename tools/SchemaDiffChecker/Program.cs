using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using GeneratedContract;

namespace SchemaDiffChecker;

internal static class Program
{
    private static readonly JsonSerializerOptions SnapshotReadOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private static readonly JsonSerializerOptions ApiWireJson = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
    };

    private static int Main(string[] args)
    {
        var repoRoot = Directory.GetCurrentDirectory();
        var outPath = Path.Combine(repoRoot, "contract-snapshots", "contract-schema-report.md");

        for (var i = 0; i < args.Length; i++)
        {
            if (args[i] is "--repo-root" && i + 1 < args.Length)
                repoRoot = Path.GetFullPath(args[++i]);
            else if (args[i] is "--out" && i + 1 < args.Length)
                outPath = Path.GetFullPath(args[++i]);
        }

        var errors = new List<string>();
        var warnings = new List<string>();

        var snapshotPath = Path.Combine(repoRoot, "contract-snapshots", "EventContractV1.snapshot.json");
        var goldenPath = Path.Combine(repoRoot, "contract-snapshots", "EventContractV1.golden.json");
        var schemaPath = Path.Combine(repoRoot, "contract-snapshots", "EventContractV1.schema.json");

        if (!File.Exists(snapshotPath))
        {
            errors.Add($"Missing snapshot: {snapshotPath}");
            WriteReport(outPath, repoRoot, errors, warnings, snapshot: null);
            return 1;
        }

        var snapshot = JsonSerializer.Deserialize<ContractSnapshot>(File.ReadAllText(snapshotPath), SnapshotReadOptions);
        if (snapshot is null || snapshot.Fields.Count == 0 || snapshot.Enums.Count == 0)
        {
            errors.Add("Snapshot file is empty or invalid.");
            WriteReport(outPath, repoRoot, errors, warnings, snapshot);
            return 1;
        }

        ValidateVersionConstants(repoRoot, snapshot, errors);
        ValidateDtoAgainstSnapshot(snapshot, errors, warnings);
        ValidateApiEnumWire(snapshot, errors);
        ValidateMauiSources(repoRoot, snapshot, errors);
        ValidateGoldenDocument(snapshot, goldenPath, errors);
        ValidateSchemaPropertySurface(snapshot, schemaPath, errors);

        WriteReport(outPath, repoRoot, errors, warnings, snapshot);

        return errors.Count > 0 ? 1 : 0;
    }

    private static void ValidateVersionConstants(string repoRoot, ContractSnapshot snapshot, List<string> errors)
    {
        var specPath = Path.Combine(repoRoot, "ContractDefinition", "Core", "EventContractV1.cs");
        if (!File.Exists(specPath))
        {
            errors.Add($"Contract spec not found: {specPath}");
            return;
        }

        var v = ReadConstVersion(File.ReadAllText(specPath));
        if (v is null)
            errors.Add("ContractDefinition EventContractV1: could not parse Version constant.");
        else if (!string.Equals(v, snapshot.ContractVersion, StringComparison.Ordinal))
            errors.Add(
                $"ContractDefinition EventContractV1.Version is '{v}' but snapshot.contractVersion is '{snapshot.ContractVersion}'.");
    }

    private static string? ReadConstVersion(string text) =>
        Regex.Match(text, @"Version\s*=\s*""(?<v>[^""]+)""").Groups["v"].Value is { Length: > 0 } v ? v : null;

    private static void ValidateDtoAgainstSnapshot(ContractSnapshot snapshot, List<string> errors, List<string> warnings)
    {
        var dto = typeof(EventContractV1Dto);
        var snapshotNames = snapshot.Fields.Select(f => f.JsonName).ToHashSet(StringComparer.Ordinal);

        var dtoProps = dto.GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly);
        var dtoByJson = new Dictionary<string, PropertyInfo>(StringComparer.Ordinal);
        foreach (var p in dtoProps)
        {
            var json = GetJsonName(p);
            dtoByJson[json] = p;
        }

        foreach (var name in snapshotNames)
        {
            if (!dtoByJson.ContainsKey(name))
                errors.Add($"Snapshot field '{name}' is missing on EventContractV1Dto.");
        }

        foreach (var kv in dtoByJson)
        {
            if (!snapshotNames.Contains(kv.Key))
                errors.Add($"EventContractV1Dto exposes JSON property '{kv.Key}' which is not in snapshot (silent evolution / drift).");
        }

        var nullability = new NullabilityInfoContext();
        foreach (var field in snapshot.Fields)
        {
            if (!dtoByJson.TryGetValue(field.JsonName, out var prop))
                continue;

            var inferredKinds = InferWireKinds(prop);
            var snapKinds = field.WireKinds.ToHashSet(StringComparer.OrdinalIgnoreCase);
            var inferredSet = inferredKinds.ToHashSet(StringComparer.OrdinalIgnoreCase);
            if (!snapKinds.SetEquals(inferredSet))
                errors.Add(
                    $"Type drift on '{field.JsonName}': snapshot wireKinds [{string.Join(", ", field.WireKinds)}] vs DTO [{string.Join(", ", inferredKinds)}].");

            var dtoAllowsNull = PropertyAllowsNull(nullability, prop);
            if (dtoAllowsNull != field.AllowsNull)
                errors.Add(
                    $"Nullability drift on '{field.JsonName}': snapshot allowsNull={field.AllowsNull} vs DTO inferred allowsNull={dtoAllowsNull}.");

            if (field.AllowsNull && !dtoAllowsNull)
                warnings.Add(
                    $"Compatibility note: '{field.JsonName}' is nullable on the wire in snapshot but DTO is non-nullable — verify ingestion defaults.");
            if (!field.AllowsNull && dtoAllowsNull)
                warnings.Add(
                    $"Compatibility note: '{field.JsonName}' is non-nullable on snapshot but DTO allows null — optional→required style risk for consumers.");
        }
    }

    private static void ValidateApiEnumWire(ContractSnapshot snapshot, List<string> errors)
    {
        CompareEnumGroup<EventActionKind>(snapshot, "actionType", errors);
        CompareEnumGroup<EventGeoSource>(snapshot, "geoSource", errors);
        CompareEnumGroup<EventUserTier>(snapshot, "userType", errors);
    }

    private static void CompareEnumGroup<TEnum>(ContractSnapshot snapshot, string key, List<string> errors)
        where TEnum : struct, Enum
    {
        if (!snapshot.Enums.TryGetValue(key, out var expected) || expected.Count == 0)
        {
            errors.Add($"Snapshot enums.{key} is missing or empty.");
            return;
        }

        var actual = SerializeEnumWireValues(typeof(TEnum)).ToHashSet(StringComparer.Ordinal);
        var exp = expected.ToHashSet(StringComparer.Ordinal);
        if (!exp.SetEquals(actual))
            errors.Add($"API enum serialization mismatch for '{key}': snapshot {FormatSet(exp)} vs API {FormatSet(actual)}.");
    }

    private static List<string> SerializeEnumWireValues(Type propertyOrEnumType)
    {
        var t = Nullable.GetUnderlyingType(propertyOrEnumType) ?? propertyOrEnumType;
        if (!t.IsEnum)
            return [];

        var list = new List<string>();
        foreach (var name in Enum.GetNames(t))
        {
            var boxed = Enum.Parse(t, name);
            var json = JsonSerializer.Serialize(boxed, t, ApiWireJson);
            if (json.Length >= 2 && json[0] == '"' && json[^1] == '"')
                list.Add(json[1..^1]);
        }

        return list.Distinct(StringComparer.Ordinal).OrderBy(s => s, StringComparer.Ordinal).ToList();
    }

    private static void ValidateMauiSources(string repoRoot, ContractSnapshot snapshot, List<string> errors)
    {
        var ms = snapshot.MauiSources;
        if (ms is null)
        {
            errors.Add("Snapshot mauiSources block is missing.");
            return;
        }

        var translationEvent = Read(repoRoot, ms.TranslationEvent);
        var actionWire = Read(repoRoot, ms.ActionWire);
        var geoWire = Read(repoRoot, ms.GeoWire);

        if (translationEvent is null)
            errors.Add($"MAUI translation event file missing: {ms.TranslationEvent}");
        if (actionWire is null)
            errors.Add($"MAUI action wire file missing: {ms.ActionWire}");
        if (geoWire is null)
            errors.Add($"MAUI geo wire file missing: {ms.GeoWire}");

        if (translationEvent is null || actionWire is null || geoWire is null)
            return;

        foreach (var f in snapshot.Fields)
        {
            if (string.IsNullOrWhiteSpace(f.MauiProperty))
            {
                errors.Add($"Field '{f.JsonName}' is missing mauiProperty in snapshot.");
                continue;
            }

            if (!ContainsMauiPropertyDeclaration(translationEvent, f.MauiProperty))
                errors.Add(
                    $"MAUI TranslationEvent does not declare property '{f.MauiProperty}' (snapshot field '{f.JsonName}').");
        }

        if (snapshot.Enums.TryGetValue("actionType", out var action))
        {
            foreach (var w in action)
            {
                if (!actionWire.Contains($"\"{w}\"", StringComparison.Ordinal))
                    errors.Add($"MAUI action wire source must contain literal \"{w}\" for enum actionType.");
            }
        }

        if (snapshot.Enums.TryGetValue("geoSource", out var geo))
        {
            foreach (var w in geo)
            {
                if (!geoWire.Contains($"\"{w}\"", StringComparison.Ordinal))
                    errors.Add($"MAUI geo wire source must contain literal \"{w}\" for enum geoSource.");
            }
        }
    }

    private static string? Read(string repoRoot, string relative) =>
        File.Exists(Path.Combine(repoRoot, relative)) ? File.ReadAllText(Path.Combine(repoRoot, relative)) : null;

    private static bool ContainsMauiPropertyDeclaration(string translationEventSource, string propertyName) =>
        Regex.IsMatch(
            translationEventSource,
            $@"\b(public|init)\b[\s\S]{{0,240}}?\b{Regex.Escape(propertyName)}\b",
            RegexOptions.CultureInvariant);

    private static void ValidateGoldenDocument(ContractSnapshot snapshot, string goldenPath, List<string> errors)
    {
        if (!File.Exists(goldenPath))
        {
            errors.Add($"Missing golden document: {goldenPath}");
            return;
        }

        using var doc = JsonDocument.Parse(File.ReadAllText(goldenPath));
        var keys = doc.RootElement.EnumerateObject().Select(p => p.Name).ToHashSet(StringComparer.Ordinal);
        var expected = snapshot.Fields.Select(f => f.JsonName).ToHashSet(StringComparer.Ordinal);
        foreach (var k in expected)
        {
            if (!keys.Contains(k))
                errors.Add($"Golden JSON is missing key '{k}'.");
        }

        foreach (var k in keys)
        {
            if (!expected.Contains(k))
                errors.Add($"Golden JSON has extra key '{k}' not present in snapshot fields.");
        }

        if (doc.RootElement.TryGetProperty("contractVersion", out var cv) && cv.ValueKind == JsonValueKind.String)
        {
            var gv = cv.GetString();
            if (!string.Equals(gv, snapshot.ContractVersion, StringComparison.Ordinal))
                errors.Add($"Golden contractVersion '{gv}' must match snapshot.contractVersion '{snapshot.ContractVersion}'.");
        }
    }

    private static void ValidateSchemaPropertySurface(ContractSnapshot snapshot, string schemaPath, List<string> errors)
    {
        if (!File.Exists(schemaPath))
        {
            errors.Add($"Missing JSON schema file: {schemaPath}");
            return;
        }

        using var doc = JsonDocument.Parse(File.ReadAllText(schemaPath));
        if (!doc.RootElement.TryGetProperty("properties", out var props) || props.ValueKind != JsonValueKind.Object)
        {
            errors.Add("JSON schema must contain a root.properties object.");
            return;
        }

        var schemaKeys = props.EnumerateObject().Select(p => p.Name).ToHashSet(StringComparer.Ordinal);
        var expected = snapshot.Fields.Select(f => f.JsonName).ToHashSet(StringComparer.Ordinal);
        foreach (var k in expected)
        {
            if (!schemaKeys.Contains(k))
                errors.Add($"JSON schema properties missing '{k}'.");
        }

        foreach (var k in schemaKeys)
        {
            if (!expected.Contains(k))
                errors.Add($"JSON schema exposes '{k}' which is not listed in snapshot fields.");
        }
    }

    private static string FormatSet(HashSet<string> s) => "{" + string.Join(", ", s.OrderBy(x => x, StringComparer.Ordinal)) + "}";

    private static string GetJsonName(PropertyInfo p)
    {
        var attr = p.GetCustomAttribute<JsonPropertyNameAttribute>();
        if (attr is not null && !string.IsNullOrWhiteSpace(attr.Name))
            return attr.Name;
        return JsonNamingPolicy.CamelCase.ConvertName(p.Name);
    }

    private static IReadOnlyList<string> InferWireKinds(PropertyInfo p)
    {
        var t = Nullable.GetUnderlyingType(p.PropertyType) ?? p.PropertyType;
        if (t.IsEnum)
            return new[] { "string" };

        if (t == typeof(string))
            return new[] { "string" };
        if (t == typeof(bool))
            return new[] { "boolean" };
        if (t == typeof(long) || t == typeof(int))
            return new[] { "integer" };
        if (t == typeof(double))
            return new[] { "number" };
        if (t == typeof(DateTimeOffset))
            return new[] { "string" };

        return new[] { t.Name.ToLowerInvariant() };
    }

    private static bool PropertyAllowsNull(NullabilityInfoContext ctx, PropertyInfo p)
    {
        var t = p.PropertyType;
        if (Nullable.GetUnderlyingType(t) is not null)
            return true;

        if (!t.IsValueType)
        {
            var info = ctx.Create(p);
            return info.ReadState is NullabilityState.Nullable;
        }

        return false;
    }

    private static void WriteReport(string outPath, string repoRoot, List<string> errors, List<string> warnings, ContractSnapshot? snapshot)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(outPath)!);
        var sb = new StringBuilder();
        sb.AppendLine("# Contract schema drift report");
        sb.AppendLine();
        sb.AppendLine($"Generated (UTC): `{DateTime.UtcNow:O}`");
        sb.AppendLine();
        sb.AppendLine($"Repo root: `{repoRoot}`");
        sb.AppendLine();

        sb.AppendLine("## Summary");
        sb.AppendLine();
        if (errors.Count == 0 && warnings.Count == 0)
            sb.AppendLine("No drift detected. Contract surface matches snapshot, DTO, MAUI sources, golden document, and JSON schema property set.");
        else
        {
            sb.AppendLine($"- Errors: **{errors.Count}**");
            sb.AppendLine($"- Warnings: **{warnings.Count}**");
        }

        sb.AppendLine();

        sb.AppendLine("## Errors");
        sb.AppendLine();
        if (errors.Count == 0)
            sb.AppendLine("_None._");
        else
            foreach (var e in errors)
                sb.AppendLine($"- {e}");
        sb.AppendLine();

        sb.AppendLine("## Warnings");
        sb.AppendLine();
        if (warnings.Count == 0)
            sb.AppendLine("_None._");
        else
            foreach (var w in warnings)
                sb.AppendLine($"- {w}");
        sb.AppendLine();

        if (snapshot?.Compatibility?.RiskMatrix is { Count: > 0 } matrix)
        {
            sb.AppendLine("## Compatibility risk matrix (from snapshot)");
            sb.AppendLine();
            sb.AppendLine("| Change | Severity | Mitigation |");
            sb.AppendLine("| --- | --- | --- |");
            foreach (var row in matrix)
                sb.AppendLine($"| {EscapeMd(row.Change)} | {EscapeMd(row.Severity)} | {EscapeMd(row.Mitigation)} |");
            sb.AppendLine();
        }

        if (snapshot?.Compatibility?.Notes is { Count: > 0 } notes)
        {
            sb.AppendLine("## Snapshot notes");
            sb.AppendLine();
            foreach (var n in notes)
                sb.AppendLine($"- {n}");
            sb.AppendLine();
        }

        File.WriteAllText(outPath, sb.ToString());
    }

    private static string EscapeMd(string s) => s.Replace("|", "\\|", StringComparison.Ordinal);

    private sealed class ContractSnapshot
    {
        public string ContractId { get; set; } = "";
        public string ContractVersion { get; set; } = "";
        public string SnapshotToolingVersion { get; set; } = "";
        public List<SnapshotField> Fields { get; set; } = new();
        public Dictionary<string, List<string>> Enums { get; set; } = new(StringComparer.OrdinalIgnoreCase);
        public MauiSources? MauiSources { get; set; }
        public CompatibilityBlock? Compatibility { get; set; }
    }

    private sealed class MauiSources
    {
        public string TranslationEvent { get; set; } = "";
        public string EventContractVersion { get; set; } = "";
        public string ActionWire { get; set; } = "";
        public string GeoWire { get; set; } = "";
    }

    private sealed class CompatibilityBlock
    {
        public List<RiskRow>? RiskMatrix { get; set; }
        public List<string>? Notes { get; set; }
    }

    private sealed class RiskRow
    {
        public string Change { get; set; } = "";
        public string Severity { get; set; } = "";
        public string Mitigation { get; set; } = "";
    }

    private sealed class SnapshotField
    {
        public string JsonName { get; set; } = "";
        public string MauiProperty { get; set; } = "";
        public List<string> WireKinds { get; set; } = new();
        public bool AllowsNull { get; set; }
    }
}
