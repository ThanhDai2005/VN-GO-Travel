namespace ContractObservability;

/// <summary>
/// Immutable wire-shaped snapshot for telemetry (no dependency on MAUI models).
/// </summary>
public sealed class ContractTelemetryWireSample
{
    public string? ContractVersion { get; init; }
    public string? EventId { get; init; }
    public string? RequestId { get; init; }
    public string? SessionId { get; init; }
    public string? PoiCode { get; init; }
    public string? Language { get; init; }
    public string? UserTypeWire { get; init; }
    public string? UserId { get; init; }
    public string? DeviceId { get; init; }
    public string? Status { get; init; }
    public long DurationMs { get; init; }
    public DateTimeOffset Timestamp { get; init; }
    public string? Source { get; init; }
    public string? ActionTypeWire { get; init; }
    public string? NetworkType { get; init; }
    public bool? UserApproved { get; init; }
    public bool FetchTriggered { get; init; }
    public double? Latitude { get; init; }
    public double? Longitude { get; init; }
    public double? GeoRadiusMeters { get; init; }
    public string? GeoSourceWire { get; init; }
    public int? BatchItemCount { get; init; }

    /// <summary>Origin label for dashboards (e.g. maui, api).</summary>
    public string SourceLabel { get; init; } = "unknown";

    /// <summary>True when the event failed ingestion validation (API only).</summary>
    public bool IngestionRejected { get; init; }

    /// <summary>Deep copy for append-only journal storage (6.7.6).</summary>
    public ContractTelemetryWireSample Clone() =>
        new()
        {
            ContractVersion = ContractVersion,
            EventId = EventId,
            RequestId = RequestId,
            SessionId = SessionId,
            PoiCode = PoiCode,
            Language = Language,
            UserTypeWire = UserTypeWire,
            UserId = UserId,
            DeviceId = DeviceId,
            Status = Status,
            DurationMs = DurationMs,
            Timestamp = Timestamp,
            Source = Source,
            ActionTypeWire = ActionTypeWire,
            NetworkType = NetworkType,
            UserApproved = UserApproved,
            FetchTriggered = FetchTriggered,
            Latitude = Latitude,
            Longitude = Longitude,
            GeoRadiusMeters = GeoRadiusMeters,
            GeoSourceWire = GeoSourceWire,
            BatchItemCount = BatchItemCount,
            SourceLabel = SourceLabel,
            IngestionRejected = IngestionRejected
        };
}
