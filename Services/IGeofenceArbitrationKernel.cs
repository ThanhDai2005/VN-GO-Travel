using Microsoft.Maui.Devices.Sensors;

namespace MauiApp1.Services;

/// <summary>
/// 7.2.3 — Single ingestion gateway for GPS samples: centralizes <see cref="AppState.CurrentLocation"/>
/// and serializes <see cref="IGeofenceService.CheckLocationAsync"/> across all producers.
/// </summary>
public interface IGeofenceArbitrationKernel
{
    /// <summary>
    /// Publishes a location sample from a named producer. Must not be called from <see cref="IGeofenceService"/> itself.
    /// </summary>
    /// <param name="location">GPS fix; null is ignored.</param>
    /// <param name="producerId">Stable id, e.g. <c>map</c> or <c>background</c>.</param>
    Task PublishLocationAsync(Location? location, string producerId, CancellationToken cancellationToken = default);
}
