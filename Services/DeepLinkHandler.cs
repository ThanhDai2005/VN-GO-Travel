using System.Threading.Tasks;
using MauiApp1.Models;
using System.Diagnostics;

namespace MauiApp1.Services;

/// <summary>
/// App-side stub for handling incoming external links. Planned only: does NOT wire platform entry points.
/// Reuses <see cref="PoiEntryCoordinator"/> to normalize, lookup and navigate to POI when possible.
/// </summary>
public class DeepLinkHandler
{
    private readonly PoiEntryCoordinator _coordinator;

    public DeepLinkHandler(PoiEntryCoordinator coordinator)
    {
        _coordinator = coordinator;
    }

    /// <summary>
    /// Handle a raw incoming link on the app side.
    /// This method does not register any platform callbacks; it merely provides a reuseable entry point
    /// so that platform code can call it later when wiring deep links.
    /// </summary>
    /// <param name="rawLink">The raw URL or payload string received from outside.</param>
    /// <param name="preferredLanguage">Optional preferred language for lookup.</param>
    public async Task<DeepLinkHandleResult> HandleIncomingLinkAsync(string rawLink, string? preferredLanguage = null)
    {
        if (string.IsNullOrWhiteSpace(rawLink))
            return new DeepLinkHandleResult { Success = false, Error = "Empty link" };

        Debug.WriteLine($"[DL-NAV] HandleIncomingLinkAsync raw={rawLink}");

        var parsedPreview = QrResolver.Parse(rawLink);
        if (parsedPreview.Success)
            Debug.WriteLine($"[DL-NAV] Parsed code={parsedPreview.Code}");
        else
            Debug.WriteLine($"[DL-NAV] Parse failed: {parsedPreview.Error}");

        var request = new PoiEntryRequest
        {
            RawInput = rawLink,
            Source = PoiEntrySource.FutureDeepLink,
            PreferredLanguage = preferredLanguage
        };

        Debug.WriteLine("[DL-NAV] Invoking PoiEntryCoordinator (same path as QR/manual)");
        var entryResult = await _coordinator.HandleEntryAsync(request);
        if (entryResult.Success)
            Debug.WriteLine("[DL-NAV] Resolved POI successfully");
        else
            Debug.WriteLine($"[DL-NAV] PoiEntryCoordinator finished without navigation: {entryResult.Error}");
        return new DeepLinkHandleResult { Success = entryResult.Success, Error = entryResult.Error };
    }
}
