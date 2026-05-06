using System.Diagnostics;
using MauiApp1.ApplicationContracts.Services;
using Microsoft.Extensions.DependencyInjection;

namespace MauiApp1.Services;

/// <summary>
/// 7.2 — Deterministic ordering for cold start / Shell-ready hooks (no new architecture).
/// Deep links and QR still resolve through <see cref="PoiEntryCoordinator"/>; this type only sequences shared prerequisites.
/// </summary>
public static class AppBootstrapPipeline
{
    /// <summary>Step 1 — session restore (called from <see cref="Views.AuthStartupPage"/>).</summary>
    public static Task RestoreSessionAsync(AuthService auth, CancellationToken cancellationToken = default) =>
        auth.RestoreSessionAsync(cancellationToken);

    /// <summary>
    /// After Shell is visible: initialize localization (translation lookup surface) then consume pending deep links.
    /// Order: translation context → external entry intents (per 7.2 spec).
    /// </summary>
    public static async Task OnShellReadyAsync(IServiceProvider services, DeepLinkCoordinator? deepLinks)
    {
        try
        {
            var loc = services.GetService<ILocalizationService>();
            if (loc != null)
                await loc.InitializeAsync().ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[BOOT-7.2] Localization init: {ex.Message}");
        }

        try
        {
            deepLinks?.OnShellAppeared();
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[BOOT-7.2] Deep link dispatch: {ex.Message}");
        }

        _ = Task.Run(async () =>
        {
            try
            {
                var auth = services.GetService<AuthService>();
                var zoneAccess = services.GetService<IZoneAccessService>();
                var repo = services.GetService<IZoneAccessRepository>();
                var audioDownload = services.GetService<IAudioDownloadService>();
                if (auth == null || zoneAccess == null || repo == null || audioDownload == null)
                    return;
                if (!auth.IsAuthenticated || string.IsNullOrWhiteSpace(auth.UserId))
                    return;

                await zoneAccess.SyncWithServerAsync().ConfigureAwait(false);
                var purchasedZones = await repo.GetPurchasedZonesAsync(auth.UserId).ConfigureAwait(false);
                foreach (var zone in purchasedZones.Distinct(StringComparer.OrdinalIgnoreCase))
                {
                    var downloaded = await repo.IsZoneDownloadedAsync(zone).ConfigureAwait(false);
                    if (!downloaded)
                        await audioDownload.DownloadZoneAudioAsync(zone).ConfigureAwait(false);
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[BOOT-7.2] Purchase audio backfill: {ex.Message}");
            }
        });
    }
}
