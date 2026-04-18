using System.Text.Json;
using System.Text.Json.Serialization;

namespace ContractObservability.Replay;

/// <summary>JSON options aligned with TranslationEvents.Api wire serialization for DTO snapshots.</summary>
public static class ContractReplaySerialization
{
    public static readonly JsonSerializerOptions ApiWireSnapshot = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
    };
}
