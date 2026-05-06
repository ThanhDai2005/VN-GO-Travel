using System.Threading.Tasks;
using MauiApp1.Models;

namespace MauiApp1.Services;

public interface IAccessStateCoordinator
{
    event Action<string, bool>? ZoneAccessChanged;
    
    /// <summary>
    /// Central authority for evaluating access state.
    /// Deduplicates concurrent requests and debounces rapid calls.
    /// </summary>
    Task<AccessEvaluationResult> EvaluateAccessAsync(string poiCode, bool forceRefresh = false, CancellationToken ct = default);
    
    /// <summary>
    /// Returns the last known state for a POI from the coordinator's memory cache.
    /// </summary>
    AccessEvaluationResult GetLastKnownState(string poiCode);

    /// <summary>
    /// Forces a full re-evaluation of all caches (Invalidates TTL).
    /// </summary>
    Task<AccessEvaluationResult> ForceRefreshAsync(string poiCode, CancellationToken ct = default);

    Task InvalidateAndRefreshAsync(string poiCode, CancellationToken ct = default);

    /// <summary>
    /// Triggers the ZoneAccessChanged event.
    /// </summary>
    void NotifyZoneAccessChanged(string zoneCode, bool hasAccess);
}
