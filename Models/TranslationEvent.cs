using System.Text.Json.Serialization;

namespace MauiApp1.Models;

public enum TranslationEventStatus
{
    Requested,
    DedupHit,
    Success,
    Failed,
    Exception,

    /// <summary>Non-translation engagement (QR, sync, cache, etc.).</summary>
    AppEvent
}

public sealed class TranslationEvent
{
    /// <summary>Locked contract version (<see cref="EventContractV1.Version"/>).</summary>
    [JsonPropertyName(EventContractV1.VersionPropertyName)]
    public string ContractVersion { get; init; } = EventContractV1.Version;

    /// <summary>Unique per tracked event; assigned when enqueued.</summary>
    public string EventId { get; init; } = "";

    /// <summary>Shared by all events from one logical request when applicable.</summary>
    public string RequestId { get; init; } = "";

    /// <summary>Stable for the app process; optional for older buffers.</summary>
    public string SessionId { get; init; } = "";

    public string PoiCode { get; init; } = "";
    public string Language { get; init; } = "";
    public EventUserTier UserType { get; init; }
    public string? UserId { get; init; }
    public string DeviceId { get; init; } = "";

    [JsonIgnore]
    public TranslationEventStatus Status { get; init; }

    /// <summary>Analytics-friendly snake_case status (not derived from enum ToString()).</summary>
    [JsonPropertyName("status")]
    public string StatusSnake { get; init; } = "";

    /// <summary>Non-negative duration in milliseconds (translation wall time, sync wall time, or 0 for point-in-time events).</summary>
    public long DurationMs { get; init; }

    public DateTimeOffset Timestamp { get; init; } = DateTimeOffset.UtcNow;

    /// <summary>Domain source label (e.g. qr_scan, nearby_sync, translation, local_cache).</summary>
    public string Source { get; init; } = "";

    /// <summary>Normalized analytics action (canonical enum; JSON camelCase).</summary>
    [JsonConverter(typeof(AnalyticsActionKindConverter))]
    public EventActionKind ActionType { get; init; }

    /// <summary>wifi, cellular, offline, unknown.</summary>
    public string NetworkType { get; init; } = "";

    public bool? UserApproved { get; init; }

    /// <summary>Whether a network fetch was executed for this event (always serialized; legacy null reads as false).</summary>
    [JsonConverter(typeof(FetchTriggeredBooleanConverter))]
    public bool FetchTriggered { get; init; }

    /// <summary>POI or device latitude snapshot at emission (immutable).</summary>
    public double? Latitude { get; init; }

    /// <summary>POI or device longitude snapshot at emission (immutable).</summary>
    public double? Longitude { get; init; }

    /// <summary>POI radius in meters when anchored to a POI row or QR payload (immutable).</summary>
    public double? GeoRadiusMeters { get; init; }

    /// <summary>Provenance of <see cref="Latitude"/>/<see cref="Longitude"/> (contract: gps | qr | db | unknown).</summary>
    [JsonConverter(typeof(GeoSnapshotSourceConverter))]
    public EventGeoSource GeoSource { get; init; }

    /// <summary>Optional batch cardinality (e.g. nearby sync rows); not a duration.</summary>
    public int? BatchItemCount { get; init; }
}
