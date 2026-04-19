using System.Text.Json.Serialization;

namespace MauiApp1.Services.RBEL;

/// <summary>Wire shape for 7.3.0 <c>POST /api/v1/intelligence/events/batch</c> (EventContractV2 + RBEL fields).</summary>
public sealed class RbelWireEvent
{
    [JsonPropertyName("contractVersion")] public string ContractVersion { get; set; } = "v2";

    [JsonPropertyName("eventId")] public string EventId { get; set; } = "";

    [JsonPropertyName("correlationId")] public string CorrelationId { get; set; } = "";

    [JsonPropertyName("sessionId")] public string SessionId { get; set; } = "";

    [JsonPropertyName("deviceId")] public string DeviceId { get; set; } = "";

    [JsonPropertyName("userId")] public string? UserId { get; set; }

    [JsonPropertyName("authState")] public string AuthState { get; set; } = "guest";

    [JsonPropertyName("userType")] public string UserType { get; set; } = "guest";

    [JsonPropertyName("sourceSystem")] public string SourceSystem { get; set; } = "ROEL";

    [JsonPropertyName("rbelEventFamily")] public string RbelEventFamily { get; set; } = "observability";

    [JsonPropertyName("rbelMappingVersion")] public string RbelMappingVersion { get; set; } = "rbel-1.0.1";

    [JsonPropertyName("runtimeTickUtcTicks")] public long RuntimeTickUtcTicks { get; set; }

    [JsonPropertyName("runtimeSequence")] public long RuntimeSequence { get; set; }

    [JsonPropertyName("timestamp")] public DateTimeOffset Timestamp { get; set; }

    [JsonPropertyName("payload")] public Dictionary<string, object?> Payload { get; set; } = new();
}
