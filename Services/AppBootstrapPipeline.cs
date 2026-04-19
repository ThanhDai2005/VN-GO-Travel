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
    }
}
