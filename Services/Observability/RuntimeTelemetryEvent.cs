namespace MauiApp1.Services.Observability;

/// <summary>Immutable telemetry envelope (readonly struct for low-allocation enqueue).</summary>
public readonly struct RuntimeTelemetryEvent
{
    public readonly RuntimeTelemetryEventKind Kind;
    public readonly long UtcTicks;
    public readonly string? ProducerId;
    public readonly double? Latitude;
    public readonly double? Longitude;
    public readonly string? PoiCode;
    public readonly string? RouteOrAction;
    public readonly string? Detail;

    public RuntimeTelemetryEvent(
        RuntimeTelemetryEventKind kind,
        long utcTicks,
        string? producerId = null,
        double? latitude = null,
        double? longitude = null,
        string? poiCode = null,
        string? routeOrAction = null,
        string? detail = null)
    {
        Kind = kind;
        UtcTicks = utcTicks;
        ProducerId = producerId;
        Latitude = latitude;
        Longitude = longitude;
        PoiCode = poiCode;
        RouteOrAction = routeOrAction;
        Detail = detail;
    }
}
