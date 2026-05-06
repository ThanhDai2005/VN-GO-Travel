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
    private readonly IZoneResolverService _zoneResolver;

    public UserEntitlementService(IPoiQueryRepository poiQuery, IZoneAccessService zoneAccess, IZoneResolverService zoneResolver)
    {
        _poiQuery = poiQuery;
        _zoneAccess = zoneAccess;
        _zoneResolver = zoneResolver;
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
        var norm = poiCode.Trim().ToUpperInvariant();
        var poi = await _poiQuery.GetAnyLanguageByCodeAsync(norm, ct).ConfigureAwait(false);
        
        // --- STEP 3: SHADOW COMPARISON ---
        var oldZone = poi?.ZoneCode?.Trim().ToUpperInvariant();
        var newZone = (await _zoneResolver.ResolveZoneAsync(norm, ct: ct).ConfigureAwait(false))?.Trim().ToUpperInvariant();

        if (oldZone != newZone)
        {
            System.Diagnostics.Debug.WriteLine($"[ENTITLEMENT-SHADOW] ZONE_MISMATCH: poi={norm} old={oldZone ?? "NULL"} new={newZone ?? "NULL"}");
        }

        // --- STEP 4: SWITCH TO NEW LOGIC ---
        var zoneCode = newZone ?? oldZone;
        
        if (string.IsNullOrWhiteSpace(zoneCode))
            return false;

        return await _zoneAccess.HasAccessAsync(zoneCode, ct).ConfigureAwait(false);
    }
}
