using MauiApp1.Services;
using MauiApp1.Services.Observability;
using Microsoft.Maui.Devices.Sensors;

namespace MauiApp1.Services.Chaos;

/// <summary>PCSL — injects stress before ROEL/GAK. Pass-through when chaos is disabled or Release.</summary>
public sealed class ChaosGeofenceArbitrationKernel : IGeofenceArbitrationKernel
{
    private readonly ObservingGeofenceArbitrationKernel _inner;
    private readonly IRuntimeTelemetry _telemetry;

    public ChaosGeofenceArbitrationKernel(
        ObservingGeofenceArbitrationKernel inner,
        IRuntimeTelemetry telemetry)
    {
        _inner = inner;
        _telemetry = telemetry;
    }

    public async Task PublishLocationAsync(Location? location, string producerId, CancellationToken cancellationToken = default)
    {
#if DEBUG
        if (ChaosSimulationOptions.IsEnabled && location != null)
        {
            await ApplyChaosGpsAsync(location, producerId, cancellationToken).ConfigureAwait(false);
            return;
        }
#endif
        await _inner.PublishLocationAsync(location, producerId, cancellationToken).ConfigureAwait(false);
    }

#if DEBUG
    private async Task ApplyChaosGpsAsync(Location location, string producerId, CancellationToken cancellationToken)
    {
        var modes = ChaosSimulationOptions.ActiveModes;
        var loc = modes.HasFlag(ChaosSimulationFlags.GpsJitter) ? ApplyJitter(location) : location;

        if (modes.HasFlag(ChaosSimulationFlags.GpsDelay))
            await Task.Delay(Random.Shared.Next(8, 60), cancellationToken).ConfigureAwait(false);

        if (modes.HasFlag(ChaosSimulationFlags.GpsBurst))
        {
            await _inner.PublishLocationAsync(ApplyJitter(loc), producerId + "/pcsl-burst-1", cancellationToken)
                .ConfigureAwait(false);
            await Task.Delay(Random.Shared.Next(5, 25), cancellationToken).ConfigureAwait(false);
        }

        if (modes.HasFlag(ChaosSimulationFlags.ConcurrencyBurst))
        {
            var tasks = new Task[3];
            for (var i = 0; i < tasks.Length; i++)
            {
                var idx = i;
                tasks[i] = Task.Run(
                    async () =>
                    {
                        await _inner.PublishLocationAsync(
                                ApplyJitter(loc),
                                producerId + "/pcsl-conc-" + idx,
                                cancellationToken)
                            .ConfigureAwait(false);
                    },
                    cancellationToken);
            }

            await Task.WhenAll(tasks).ConfigureAwait(false);
        }

        if (modes.HasFlag(ChaosSimulationFlags.TelemetryFlood))
        {
            for (var i = 0; i < 40; i++)
            {
                _telemetry.TryEnqueue(new RuntimeTelemetryEvent(
                    RuntimeTelemetryEventKind.PerformanceAnomaly,
                    DateTime.UtcNow.Ticks,
                    producerId,
                    detail: "pcsl-telemetry-flood-" + i));
            }
        }

        if (modes.HasFlag(ChaosSimulationFlags.GpsReorder))
        {
            await Task.Delay(5, cancellationToken).ConfigureAwait(false);
            await _inner.PublishLocationAsync(ApplyJitter(loc), producerId + "/pcsl-reorder-first", cancellationToken)
                .ConfigureAwait(false);
            await Task.Delay(35, cancellationToken).ConfigureAwait(false);
            await _inner.PublishLocationAsync(ApplyJitter(loc), producerId + "/pcsl-reorder-second", cancellationToken)
                .ConfigureAwait(false);
            return;
        }

        await _inner.PublishLocationAsync(loc, producerId, cancellationToken).ConfigureAwait(false);
    }

    private static Location ApplyJitter(Location loc)
    {
        var dLat = (Random.Shared.NextDouble() - 0.5) * 0.00012;
        var dLon = (Random.Shared.NextDouble() - 0.5) * 0.00012;
        return new Location(loc.Latitude + dLat, loc.Longitude + dLon);
    }
#endif
}
