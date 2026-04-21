using System.Diagnostics;
using System.Threading;
using MauiApp1.ApplicationContracts.Repositories;
using MauiApp1.ApplicationContracts.Services;
using MauiApp1.Models;
using MauiApp1.Services.MapUi;
using Microsoft.Extensions.Logging;

namespace MauiApp1.Services;

/// <summary>
/// Resolves a POI by code, attaches the correct localization, and sets
/// <see cref="AppState.SelectedPoi"/> to a <em>new</em> instance (binding-safe).
/// Also manages the pending-focus inbox used by PoiDetailPage → MapPage coordination.
///
/// Extracted from MapViewModel (~65 lines of async lookup + pending queue management).
/// </summary>
public class PoiFocusService
{
    private readonly IPoiQueryRepository _poiQuery;
    private readonly ILocalizationService _locService;
    private readonly TranslationOrchestrator _translationOrchestrator;
    private readonly AppState _appState;
    private readonly IMapUiStateArbitrator _mapUi;
    private readonly TranslationQueueService _translationQueue;
    private readonly ILogger<PoiFocusService> _logger;

    // Pending focus request — written by PoiDetailPage, consumed by MapPage on Appearing.
    private string? _pendingFocusPoiCode;
    private string? _pendingFocusPoiLang;

    private readonly SemaphoreSlim _focusMutex = new(1, 1);

    public PoiFocusService(
        IPoiQueryRepository poiQuery,
        ILocalizationService locService,
        TranslationOrchestrator translationOrchestrator,
        AppState appState,
        IMapUiStateArbitrator mapUi,
        TranslationQueueService translationQueue,
        ILogger<PoiFocusService> logger)
    {
        _poiQuery = poiQuery;
        _locService = locService;
        _translationOrchestrator = translationOrchestrator;
        _appState = appState;
        _mapUi = mapUi;
        _translationQueue = translationQueue;
        _logger = logger;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Focus resolution
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Resolves a POI by code, attaches the correct localization, and sets
    /// <see cref="AppState.SelectedPoi"/> to a <em>new</em> instance (binding-safe).
    /// <para>
    /// Uses <see cref="LocalizationService"/> — does NOT call
    /// <c>PoiTranslationService</c> for vi/en (which are always available in pois.json)
    /// but DOES call it for other languages when the result is a fallback (BUG-1 fix).
    /// </para>
    /// </summary>
    public async Task FocusOnPoiByCodeAsync(string code, string? lang = null)
    {
        if (string.IsNullOrWhiteSpace(code)) return;

        await _focusMutex.WaitAsync().ConfigureAwait(false);
        try
        {
            await FocusOnPoiByCodeCoreAsync(code, lang).ConfigureAwait(false);
        }
        finally
        {
            _focusMutex.Release();
        }
    }

    private async Task FocusOnPoiByCodeCoreAsync(string code, string? lang)
    {
        var normalizedCode = code.Trim().ToUpperInvariant();
        var preferred      = string.IsNullOrWhiteSpace(lang)
                             ? _appState.CurrentLanguage
                             : lang.Trim().ToLowerInvariant();

        Debug.WriteLine($"[Map-VM] FocusOnPoiByCodeAsync code={normalizedCode} lang={preferred}");

        _appState.IsTranslating = true;
        try
        {
            // Ensure localization lookup is ready — required when this is called before
            // LoadPoisAsync() runs (e.g. QR scan → Map tab is the first screen touched).
            await _locService.InitializeAsync().ConfigureAwait(false);

            // Prefer already-loaded geo data from the in-memory Pois collection.
            // Access ObservableCollection on main thread to prevent enumeration races.
            Poi? core = null;
            await MainThread.InvokeOnMainThreadAsync(() =>
            {
                core = _appState.Pois.FirstOrDefault(p => p.Code == normalizedCode);
            });

            if (core == null)
            {
                // POI not yet in the collection (e.g. QR scan before map finishes loading).
                await _poiQuery.InitAsync().ConfigureAwait(false);
                core = await _poiQuery.GetByCodeAsync(normalizedCode).ConfigureAwait(false);
            }

            if (core == null)
            {
                Debug.WriteLine($"[Map-VM] FocusOnPoiByCodeAsync: no POI found for code={normalizedCode}");
                return;
            }

            var locResult = _locService.GetLocalizationResult(normalizedCode, preferred);
            Debug.WriteLine($"[Map-VM] FocusOnPoiByCodeAsync: loc found={locResult.Localization != null} name='{locResult.Localization?.Name}' fallback={locResult.IsFallback}");

            // On-demand dynamic translation check (Queue-based)
            if (locResult.IsFallback && preferred != "vi" && preferred != "en")
            {
                _logger.LogInformation(
                    "[TranslationTrigger-Queue] Source={Source} | PoiId={PoiId} | Lang={Lang}",
                    "PoiFocus",
                    normalizedCode,
                    preferred);

                core.IsTranslating = true;
                _translationQueue.Enqueue(normalizedCode, preferred);
            }

            // Always a new instance → fires PropertyChanged("SelectedPoi") → MAUI re-reads bindings (BUG-3 fix)
            var hydratedPoi = PoiHydrationService.CreateHydratedPoi(core, locResult);
            await _mapUi.ApplySelectedPoiAsync(MapUiSelectionSource.PoiFocusFromQuery, hydratedPoi).ConfigureAwait(false);
        }
        finally
        {
            _appState.IsTranslating = false;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Pending focus inbox
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Stores a pending focus request to be consumed by MapPage on its next Appearing event.
    /// </summary>
    public void RequestFocusOnPoiCode(string code, string? lang = null)
    {
        if (string.IsNullOrWhiteSpace(code)) return;
        _pendingFocusPoiCode = code.Trim().ToUpperInvariant();
        _pendingFocusPoiLang = string.IsNullOrWhiteSpace(lang) ? null : lang.Trim().ToLowerInvariant();
        Debug.WriteLine($"[Map-VM] Pending focus code='{_pendingFocusPoiCode}' lang='{_pendingFocusPoiLang}'");
    }

    /// <summary>
    /// Consumes and clears the pending focus request. Returns (null, null) if none is queued.
    /// </summary>
    public (string? code, string? lang) ConsumePendingFocusRequest()
    {
        var code = _pendingFocusPoiCode;
        var lang = _pendingFocusPoiLang;
        _pendingFocusPoiCode = null;
        _pendingFocusPoiLang = null;
        return (code, lang);
    }
}
