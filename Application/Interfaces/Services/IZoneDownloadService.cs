namespace MauiApp1.ApplicationContracts.Services;

public interface IZoneDownloadService
{
    Task DownloadZoneAsync(string zoneId, IEnumerable<string> poiCodes, IEnumerable<string> audioUrls, CancellationToken ct = default);
    double GetDownloadProgress(string zoneId);
    void CancelDownload(string zoneId);
    Task<bool> IsZoneDownloadedAsync(string zoneId, CancellationToken ct = default);
}
