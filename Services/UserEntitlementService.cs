using MauiApp1.ApplicationContracts.Repositories;

namespace MauiApp1.Services;

/// <summary>
/// Lightweight runtime entitlement resolver for POI access.
/// Access is always computed from POI->Zone mapping and purchased zones.
/// </summary>
public sealed class UserEntitlementService : IUserEntitlementService
{
    private readonly IPoiQueryRepository _poiQuery;
    private readonly IZoneAccessService _zoneAccess;

    public UserEntitlementService(IPoiQueryRepository poiQuery, IZoneAccessService zoneAccess)
    {
        _poiQuery = poiQuery;
        _zoneAccess = zoneAccess;
    }

    public bool HasAccessToPoi(string poiCode)
    {
        // Non-blocking sync path only uses current cache snapshots.
        // Navigation/page open must call the async path to re-evaluate.
        if (string.IsNullOrWhiteSpace(poiCode))
            return false;

        return HasAccessToPoiAsync(poiCode).GetAwaiter().GetResult();
    }

    public async Task<bool> HasAccessToPoiAsync(string poiCode, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(poiCode))
            return false;

        await _poiQuery.InitAsync(ct).ConfigureAwait(false);
        var poi = await _poiQuery.GetAnyLanguageByCodeAsync(poiCode.Trim().ToUpperInvariant(), ct).ConfigureAwait(false);
        var zoneCode = poi?.ZoneCode?.Trim();
        if (string.IsNullOrWhiteSpace(zoneCode))
            return false;

        return await _zoneAccess.HasAccessAsync(zoneCode, ct).ConfigureAwait(false);
    }
}
