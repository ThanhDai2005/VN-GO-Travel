namespace MauiApp1.Services;

public interface IUserEntitlementService
{
    bool HasAccessToPoi(string poiCode);
    Task<bool> HasAccessToPoiAsync(string poiCode, CancellationToken ct = default);
}
