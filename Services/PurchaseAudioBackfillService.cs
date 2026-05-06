using System.Diagnostics;

namespace MauiApp1.Services;

/// <summary>
/// Keeps offline audio packages aligned with server-confirmed purchased zones
/// when session state changes (login/restore).
/// </summary>
public sealed class PurchaseAudioBackfillService
{
    private readonly AuthService _auth;
    private readonly IZoneAccessService _zoneAccess;
    private readonly IZoneAccessRepository _repo;
    private readonly IAudioDownloadService _audioDownload;

    public PurchaseAudioBackfillService(
        AuthService auth,
        IZoneAccessService zoneAccess,
        IZoneAccessRepository repo,
        IAudioDownloadService audioDownload)
    {
        _auth = auth;
        _zoneAccess = zoneAccess;
        _repo = repo;
        _audioDownload = audioDownload;

        _auth.SessionChanged += OnSessionChanged;
    }

    private async void OnSessionChanged(object? sender, EventArgs e)
    {
        try
        {
            if (!_auth.IsAuthenticated || string.IsNullOrWhiteSpace(_auth.UserId))
                return;

            await _zoneAccess.SyncWithServerAsync().ConfigureAwait(false);
            var zones = await _repo.GetPurchasedZonesAsync(_auth.UserId).ConfigureAwait(false);
            foreach (var zone in zones.Distinct(StringComparer.OrdinalIgnoreCase))
            {
                var downloaded = await _repo.IsZoneDownloadedAsync(zone).ConfigureAwait(false);
                if (!downloaded)
                    await _audioDownload.DownloadZoneAudioAsync(zone).ConfigureAwait(false);
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[AUDIO-BACKFILL] {ex.Message}");
        }
    }
}
