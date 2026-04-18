using System.Diagnostics;
using MauiApp1.ApplicationContracts.Services;
using Microsoft.Extensions.Logging;
using Microsoft.Maui.ApplicationModel;
using Microsoft.Maui.Devices.Sensors;

namespace MauiApp1.Services;

/// <summary>
/// Geofence Arbitration Kernel (GAK): one authoritative path for <see cref="AppState.CurrentLocation"/>
/// and at most one <see cref="IGeofenceService.CheckLocationAsync"/> per coalesced logical sample (7.2.3).
/// </summary>
public sealed class GeofenceArbitrationKernel : IGeofenceArbitrationKernel
{
    /// <summary>When true, duplicate samples still invoke geofence (legacy parity / emergency).</summary>
    public static bool DisableCoalescing { get; set; }

    private const int CoalesceWindowMs = 250;
    private const double CoalesceEpsilonMeters = 3.0;

    private readonly AppState _appState;
    private readonly IGeofenceService _geofenceService;
    private readonly ILogger<GeofenceArbitrationKernel>? _logger;

    private readonly object _sync = new();
    private DateTime _lastCommittedGeofenceUtc = DateTime.MinValue;
    private double? _lastCommittedLat;
    private double? _lastCommittedLon;

    public GeofenceArbitrationKernel(
        AppState appState,
        IGeofenceService geofenceService,
        ILogger<GeofenceArbitrationKernel>? logger = null)
    {
        _appState = appState;
        _geofenceService = geofenceService;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task PublishLocationAsync(Location? location, string producerId, CancellationToken cancellationToken = default)
    {
        if (location == null)
            return;

        await MainThread.InvokeOnMainThreadAsync(() =>
        {
            _appState.CurrentLocation = location;
        }).ConfigureAwait(false);

        var runGeofence = true;
        if (!DisableCoalescing)
        {
            lock (_sync)
            {
                var now = DateTime.UtcNow;
                if (_lastCommittedLat.HasValue && _lastCommittedLon.HasValue)
                {
                    var prev = new Location(_lastCommittedLat.Value, _lastCommittedLon.Value);
                    var distM = Location.CalculateDistance(prev, location, DistanceUnits.Kilometers) * 1000.0;
                    var ms = (now - _lastCommittedGeofenceUtc).TotalMilliseconds;
                    if (ms is >= 0 and < CoalesceWindowMs && distM < CoalesceEpsilonMeters)
                    {
                        runGeofence = false;
                        _logger?.LogDebug(
                            "[GAK] Coalesced geofence tick | producer={Producer} | dtMs={Dt:0} | distM={Dist:0.0}",
                            producerId,
                            ms,
                            distM);
                    }
                }

                if (runGeofence)
                {
                    _lastCommittedGeofenceUtc = now;
                    _lastCommittedLat = location.Latitude;
                    _lastCommittedLon = location.Longitude;
                }
            }
        }

        if (!runGeofence && !DisableCoalescing)
            return;

        try
        {
            await _geofenceService.CheckLocationAsync(location, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger?.LogWarning(ex, "[GAK] CheckLocationAsync failed | producer={Producer}", producerId);
            Debug.WriteLine($"[GAK-ERR] CheckLocationAsync: {ex.Message}");
        }
    }
}
