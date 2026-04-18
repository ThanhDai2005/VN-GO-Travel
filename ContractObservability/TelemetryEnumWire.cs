using System.Text.Json;
using System.Text.Json.Serialization;
using GeneratedContract;

namespace ContractObservability;

/// <summary>Stable JSON wire strings for enum telemetry (matches API serialization).</summary>
public static class TelemetryEnumWire
{
    private static readonly JsonSerializerOptions Options = new()
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
    };

    public static string EventAction(EventActionKind v) => ToQuoted(v);
    public static string EventGeo(EventGeoSource v) => ToQuoted(v);
    public static string UserTier(EventUserTier v) => ToQuoted(v);

    private static string ToQuoted<TEnum>(TEnum value) where TEnum : struct, Enum
    {
        var s = JsonSerializer.Serialize(value, typeof(TEnum), Options);
        return s.Length >= 2 && s[0] == '"' && s[^1] == '"' ? s[1..^1] : s;
    }
}
