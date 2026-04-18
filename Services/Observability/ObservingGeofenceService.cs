using MauiApp1.ApplicationContracts.Services;
using Microsoft.Maui.Devices.Sensors;

namespace MauiApp1.Services.Observability;

/// <summary>ROEL decorator — forwards 100% to inner geofence service.</summary>
public sealed class ObservingGeofenceService : IGeofenceService
{
    private readonly GeofenceService _inner;
    private readonly IRuntimeTelemetry _telemetry;

    public ObservingGeofenceService(GeofenceService inner, IRuntimeTelemetry telemetry)
    {
        _inner = inner;
        _telemetry = telemetry;
    }

    public async Task CheckLocationAsync(Location location, CancellationToken cancellationToken = default)
    {
        _telemetry.TryEnqueue(new RuntimeTelemetryEvent(
            RuntimeTelemetryEventKind.GeofenceEvaluated,
            DateTime.UtcNow.Ticks,
            latitude: location.Latitude,
            longitude: location.Longitude));

        await _inner.CheckLocationAsync(location, cancellationToken).ConfigureAwait(false);
    }
}
