using System.Collections.Concurrent;
using System.Diagnostics;
using MauiApp1.ApplicationContracts.Repositories;
using MauiApp1.ApplicationContracts.Services;
using MauiApp1.Services.Observability;

namespace MauiApp1.Services;

public sealed class ZoneDownloadService : IZoneDownloadService
{
    private readonly IZoneAccessService _zoneAccess;
    private readonly IZoneAccessRepository _repository;
    private readonly ILoggerService _logger;
    private readonly HttpClient _httpClient;
    private readonly ConcurrentDictionary<string, double> _progress = new();
    private readonly ConcurrentDictionary<string, CancellationTokenSource> _activeDownloads = new();

    public ZoneDownloadService(
        IZoneAccessService zoneAccess, 
        IZoneAccessRepository repository, 
        ILoggerService logger)
    {
        _zoneAccess = zoneAccess;
        _repository = repository;
        _logger = logger;
        _httpClient = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
    }

    public async Task DownloadZoneAsync(string zoneId, IEnumerable<string> poiCodes, IEnumerable<string> audioUrls, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(zoneId)) return;

        // 🔴 CRITICAL: EnsureAccessAsync(zoneId) (STEP 3)
        await _zoneAccess.EnsureAccessAsync(zoneId, ct).ConfigureAwait(false);

        _logger.LogInfo("DOWNLOAD_START", new { zoneId });

        var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        _activeDownloads[zoneId] = cts;

        try
        {
            var zoneDir = Path.Combine(FileSystem.AppDataDirectory, "zones", zoneId);
            Directory.CreateDirectory(zoneDir);

            var codeList = poiCodes.ToList();
            var urlList = audioUrls.ToList();
            int total = codeList.Count;
            int completed = 0;

            for (int i = 0; i < total; i++)
            {
                cts.Token.ThrowIfCancellationRequested();

                var code = codeList[i];
                var url = urlList[i];
                if (string.IsNullOrWhiteSpace(url)) continue;

                var filePath = Path.Combine(zoneDir, $"{code}.mp3");
                if (File.Exists(filePath)) 
                {
                    completed++;
                    _progress[zoneId] = (double)completed / total;
                    continue;
                }

                try
                {
                    var data = await _httpClient.GetByteArrayAsync(url, cts.Token).ConfigureAwait(false);
                    await File.WriteAllBytesAsync(filePath, data, cts.Token).ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    _logger.LogError("DOWNLOAD_ITEM_FAILED", ex, new { zoneId, code, url });
                }

                completed++;
                _progress[zoneId] = (double)completed / total;
            }

            await _repository.SaveDownloadAsync(zoneId, true, ct).ConfigureAwait(false);
            _logger.LogInfo("DOWNLOAD_COMPLETE", new { zoneId });
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("DOWNLOAD_CANCELLED", new { zoneId });
        }
        catch (Exception ex)
        {
            _logger.LogError("DOWNLOAD_FAILED", ex, new { zoneId });
            throw;
        }
        finally
        {
            _activeDownloads.TryRemove(zoneId, out _);
        }
    }

    public double GetDownloadProgress(string zoneId) => _progress.GetValueOrDefault(zoneId, 0);

    public void CancelDownload(string zoneId)
    {
        if (_activeDownloads.TryRemove(zoneId, out var cts))
        {
            cts.Cancel();
        }
    }

    public Task<bool> IsZoneDownloadedAsync(string zoneId, CancellationToken ct = default)
    {
        return _repository.IsZoneDownloadedAsync(zoneId, ct);
    }
}
