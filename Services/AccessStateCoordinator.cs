using System.Collections.Concurrent;
using System.Diagnostics;
using MauiApp1.Models;

namespace MauiApp1.Services;

public sealed class AccessStateCoordinator : IAccessStateCoordinator
{
    private readonly IZoneResolverService _resolver;
    private readonly IZoneAccessService _zoneAccess;
    private readonly AuthService _auth;
    private readonly ILoggerService _logger;

    private readonly ConcurrentDictionary<string, AccessEvaluationResult> _stateCache = new();
    private readonly ConcurrentDictionary<string, Task<AccessEvaluationResult>> _activeEvaluations = new();
    private readonly SemaphoreSlim _lock = new(1, 1);

    public event Action<string, bool>? ZoneAccessChanged;

    public AccessStateCoordinator(
        IZoneResolverService resolver,
        IZoneAccessService zoneAccess,
        AuthService auth,
        ILoggerService logger)
    {
        _resolver = resolver;
        _zoneAccess = zoneAccess;
        _auth = auth;
        _logger = logger;
        
        _zoneAccess.AccessChanged += (zoneId, hasAccess) => 
        {
            NotifyZoneAccessChanged(zoneId, hasAccess);
        };
    }

    public AccessEvaluationResult GetLastKnownState(string poiCode)
    {
        if (string.IsNullOrWhiteSpace(poiCode)) return new AccessEvaluationResult { State = AccessRenderState.Unknown };
        return _stateCache.TryGetValue(poiCode.ToUpperInvariant(), out var state) 
            ? state 
            : new AccessEvaluationResult { State = AccessRenderState.Resolving, PoiCode = poiCode };
    }

    public async Task<AccessEvaluationResult> EvaluateAccessAsync(string poiCode, bool forceRefresh = false, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(poiCode))
            return new AccessEvaluationResult { State = AccessRenderState.NotForSale };

        var norm = poiCode.Trim().ToUpperInvariant();

        if (forceRefresh)
        {
            _stateCache.TryRemove(norm, out _);
            return await PerformEvaluationAsync(norm, true, ct).ConfigureAwait(false);
        }

        // 1. DEDUPLICATION: Return existing task if already running
        return await _activeEvaluations.GetOrAdd(norm, _ => PerformEvaluationAsync(norm, false, ct)).ConfigureAwait(false);
    }

    public async Task<AccessEvaluationResult> ForceRefreshAsync(string poiCode, CancellationToken ct = default)
    {
        return await EvaluateAccessAsync(poiCode, true, ct).ConfigureAwait(false);
    }

    public async Task InvalidateAndRefreshAsync(string poiCode, CancellationToken ct = default)
    {
        await ForceRefreshAsync(poiCode, ct).ConfigureAwait(false);
    }

    private async Task<AccessEvaluationResult> PerformEvaluationAsync(string poiCode, bool forceRefresh, CancellationToken ct)
    {
        try
        {
            await _lock.WaitAsync(ct).ConfigureAwait(false);
            try
            {
                var zone = await _resolver.ResolveZoneAsync(poiCode, forceRefresh, ct).ConfigureAwait(false);
                var state = AccessRenderState.Unknown;

                if (string.IsNullOrWhiteSpace(zone))
                {
                    state = AccessRenderState.NotForSale; 
                }
                else if (!_auth.IsAuthenticated)
                {
                    state = AccessRenderState.NotLoggedIn;
                }
                else
                {
                    var hasAccess = await _zoneAccess.HasAccessAsync(zone, ct).ConfigureAwait(false);
                    state = hasAccess ? AccessRenderState.Unlocked : AccessRenderState.NotPurchased;
                }

                var result = new AccessEvaluationResult
                {
                    PoiCode = poiCode,
                    ZoneCode = zone,
                    State = state,
                    ResolvedAt = DateTime.UtcNow
                };

                _stateCache[poiCode] = result;
                return result;
            }
            finally
            {
                _lock.Release();
            }
        }
        catch (Exception ex)
        {
            _logger.LogError("ACCESS_COORD_EVAL_FAILED", ex, new { poiCode });
            return new AccessEvaluationResult { State = AccessRenderState.NotForSale, PoiCode = poiCode };
        }
        finally
        {
            _activeEvaluations.TryRemove(poiCode, out _);
        }
    }

    public void NotifyZoneAccessChanged(string zoneCode, bool hasAccess)
    {
        if (string.IsNullOrWhiteSpace(zoneCode)) return;
        var norm = zoneCode.Trim().ToUpperInvariant();

        // Invalidate cache for all POIs in this zone
        var keysToRemove = _stateCache.Where(kvp => string.Equals(kvp.Value.ZoneCode, norm, StringComparison.OrdinalIgnoreCase))
                                      .Select(kvp => kvp.Key)
                                      .ToList();
        
        foreach (var key in keysToRemove)
        {
            _stateCache.TryRemove(key, out _);
        }

        ZoneAccessChanged?.Invoke(norm, hasAccess);
    }
}
