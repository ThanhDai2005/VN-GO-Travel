using MauiApp1.Services;
using Microsoft.Maui.Devices.Sensors;

namespace MauiApp1.Services.Observability;

/// <summary>ROEL decorator — forwards 100% to inner GAK without modifying <see cref="GeofenceArbitrationKernel"/>.</summary>
public sealed class ObservingGeofenceArbitrationKernel : IGeofenceArbitrationKernel
{
    private readonly GeofenceArbitrationKernel _inner;
    private readonly IRuntimeTelemetry _telemetry;
    private readonly BatteryEfficiencyMonitor _battery;

    public ObservingGeofenceArbitrationKernel(
        GeofenceArbitrationKernel inner,
        IRuntimeTelemetry telemetry,
        BatteryEfficiencyMonitor battery)
    {
        _inner = inner;
        _telemetry = telemetry;
        _battery = battery;
    }

    public async Task PublishLocationAsync(Location? location, string producerId, CancellationToken cancellationToken = default)
    {
        if (location != null)
        {
            _battery.OnGpsTickObserved(producerId, location.Latitude, location.Longitude, _telemetry);
            _telemetry.TryEnqueue(new RuntimeTelemetryEvent(
                RuntimeTelemetryEventKind.GpsTickReceived,
                DateTime.UtcNow.Ticks,
                producerId,
                location.Latitude,
                location.Longitude));
        }

        await _inner.PublishLocationAsync(location, producerId, cancellationToken).ConfigureAwait(false);

        if (location != null)
        {
            _telemetry.TryEnqueue(new RuntimeTelemetryEvent(
                RuntimeTelemetryEventKind.LocationPublishCompleted,
                DateTime.UtcNow.Ticks,
                producerId,
                location.Latitude,
                location.Longitude));
        }
    }
}
