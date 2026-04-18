using System.Diagnostics;
using MauiApp1.ApplicationContracts.Repositories;
using MauiApp1.ApplicationContracts.Services;
using MauiApp1.Models;
using MauiApp1.Services.MapUi;
using Microsoft.Extensions.Logging;
using Microsoft.Maui.Networking;
using Microsoft.Maui.Controls;

namespace MauiApp1.Services;

/// <summary>
/// Owns all POI audio narration orchestration:
///   1. On-demand dynamic translation check (for non-vi/en languages)
///   2. POI hydration with the translated localization
///   3. UI sync (SelectedPoi + Pois collection update) on the main thread
///   4. TTS playback via <see cref="AudioService"/>
///
/// This is the <strong>single audio entry-point</strong> for all app flows —
/// no other code should call AudioService.SpeakAsync directly for POI narration.
///
/// Extracted from MapViewModel (was ~190 lines of mixed audio/translation/UI code).
/// </summary>
public class PoiNarrationService
{
    private readonly IAudioPlayerService _audioService;
    private readonly ILocalizationService _locService;
    private readonly TranslationOrchestrator _translationOrchestrator;
    private readonly IPoiQueryRepository _poiQuery;
    private readonly AppState _appState;
    private readonly IMapUiStateArbitrator _mapUi;
    private readonly ILogger<PoiNarrationService> _logger;
    private readonly SemaphoreSlim _translationGate = new(1, 1);

    public PoiNarrationService(
        IAudioPlayerService audioService,
        ILocalizationService locService,
        TranslationOrchestrator translationOrchestrator,
        IPoiQueryRepository poiQuery,
        AppState appState,
        IMapUiStateArbitrator mapUi,
        ILogger<PoiNarrationService> logger)
    {
        _audioService = audioService;
        _locService = locService;
        _translationOrchestrator = translationOrchestrator;
        _poiQuery = poiQuery;
        _appState = appState;
        _mapUi = mapUi;
        _logger = logger;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Plays short narration for <paramref name="poi"/>.
    /// Sets <c>AppState.ActiveNarrationCode</c> so a subsequent language switch can restart
    /// narration in the new language (BUG-2 fix).
    /// </summary>
    public async Task PlayPoiAsync(Poi poi, string? lang = null)
    {
        var language = ResolveLanguage(lang);

        // Track before speak so language-switch restart knows which POI is active.
        _appState.ActiveNarrationCode = poi.Code;
        Debug.WriteLine($"[AUDIO] PlayPoiAsync: code={poi.Code} lang={language} _activeNarrationCode='{_appState.ActiveNarrationCode}'");

        var normalizedCode = poi.Code?.Trim().ToUpperInvariant() ?? "";
        var (hydratedPoi, locResult) = await EnsureTranslatedAsync(poi, normalizedCode, language);

        // Keep UI in sync after on-demand translation (BUG-3 fix: new instance => binding fires)
        await SyncUiAsync(hydratedPoi);

        var text = SelectShortText(hydratedPoi);
        Debug.WriteLine($"[AUDIO] PlayPoiAsync: textLen={text?.Length ?? 0} text='{text?.Substring(0, Math.Min(60, text?.Length ?? 0))}'");

        if (string.IsNullOrWhiteSpace(text))
        {
            Debug.WriteLine($"[AUDIO] PlayPoiAsync: SKIPPED — no narration text for code={poi.Code} lang={language}");
            return;
        }

        await SpeakSafeAsync(poi.Code, text, language);
    }

    /// <summary>
    /// Overload that resolves the POI by <paramref name="poiCode"/> from the in-memory collection
    /// (with SQLite fallback) before playing. Useful when only the code is available
    /// (e.g. QR restart after language switch).
    /// </summary>
    public async Task PlayPoiAsync(string poiCode, string? lang = null)
    {
        if (string.IsNullOrWhiteSpace(poiCode)) return;

        var normalizedCode = poiCode.Trim().ToUpperInvariant();
        var language       = ResolveLanguage(lang);

        Debug.WriteLine($"[AUDIO] PlayPoiAsync(code): code={normalizedCode} lang={language}");

        var core = await ResolveCorePoi(normalizedCode);
        if (core == null)
        {
            Debug.WriteLine($"[AUDIO] PlayPoiAsync(code): no POI found for code={normalizedCode}");
            return;
        }

        // Fetch fresh localization — guarantees the text is in the requested language
        // even if the Poi in the collection still has the old Localization attached.
        var locResult = _locService.GetLocalizationResult(normalizedCode, language);
        var poi = PoiHydrationService.CreateHydratedPoi(core, locResult);

        await PlayPoiAsync(poi, language);
    }

    /// <summary>
    /// Plays the long narration (detailed) for <paramref name="poi"/>.
    /// Also tracks active POI for language-switch restart.
    /// </summary>
    public async Task PlayPoiDetailedAsync(Poi poi, string? lang = null)
    {
        var language = ResolveLanguage(lang);
        _appState.ActiveNarrationCode = poi.Code;
        Debug.WriteLine($"[AUDIO] PlayPoiDetailedAsync: code={poi.Code} lang={language} _activeNarrationCode='{_appState.ActiveNarrationCode}'");

        var normalizedCode = poi.Code?.Trim().ToUpperInvariant() ?? "";
        var (hydratedPoi, _) = await EnsureTranslatedAsync(poi, normalizedCode, language);

        // Keep UI in sync after on-demand translation
        await SyncUiAsync(hydratedPoi);

        var text = SelectLongText(hydratedPoi);
        Debug.WriteLine($"[AUDIO] PlayPoiDetailedAsync: textLen={text?.Length ?? 0}");

        if (string.IsNullOrWhiteSpace(text))
        {
            Debug.WriteLine($"[AUDIO] PlayPoiDetailedAsync: SKIPPED — no narration text for code={poi.Code} lang={language}");
            return;
        }

        await SpeakSafeAsync(poi.Code, text, language);
    }

    /// <summary>
    /// Stops any in-flight audio and clears the active narration POI tracking,
    /// so a subsequent language switch does NOT auto-restart audio.
    /// </summary>
    public void Stop()
    {
        _appState.ActiveNarrationCode = null;
        _audioService.StopAsync().GetAwaiter().GetResult();
        Debug.WriteLine("[AUDIO] PoiNarrationService.Stop called — active narration tracking cleared");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Returns the current app language from AppState if <paramref name="lang"/> is empty.
    /// </summary>
    private string ResolveLanguage(string? lang)
        => string.IsNullOrWhiteSpace(lang) ? _appState.CurrentLanguage : lang.Trim().ToLowerInvariant();

    /// <summary>
    /// Checks if on-demand translation is needed and applies it. Returns the hydrated POI and result.
    /// Serialized via <c>_translationGate</c> to prevent race conditions on slow networks.
    /// </summary>
    private async Task<(Poi hydratedPoi, LocalizationResult locResult)> EnsureTranslatedAsync(
        Poi poi, string normalizedCode, string language)
    {
        var locResult = _locService.GetLocalizationResult(normalizedCode, language);

        var shouldTranslate =
            !string.Equals(language, "vi", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(language, "en", StringComparison.OrdinalIgnoreCase) &&
            (locResult.Localization == null || locResult.IsFallback);

        if (!shouldTranslate)
            return (PoiHydrationService.CreateHydratedPoi(poi, locResult), locResult);

        // --- HARDENING: CONCURRENCY & NETWORK GAURDS ---
        await _translationGate.WaitAsync().ConfigureAwait(false);
        try
        {
            // Double-check after acquiring lock in case another thread finished it
            locResult = _locService.GetLocalizationResult(normalizedCode, language);
            if (locResult.Localization != null && !locResult.IsFallback)
                return (PoiHydrationService.CreateHydratedPoi(poi, locResult), locResult);

            // 1. Connectivity Check (Fail-fast)
            if (Connectivity.Current.NetworkAccess != NetworkAccess.Internet)
            {
                Debug.WriteLine("[AUDIO] Translation failed: No internet access.");
                await MainThread.InvokeOnMainThreadAsync(async () =>
                {
                    if (Microsoft.Maui.Controls.Application.Current?.Windows.FirstOrDefault()?.Page is Page page)
                    {
                        await page.DisplayAlert("Lỗi kết nối", "Cần có internet để dịch ngôn ngữ này. Vui lòng kiểm tra lại kết nối.", "OK");
                    }
                });
                return (PoiHydrationService.CreateHydratedPoi(poi, locResult), locResult);
            }

            // 2. State & Timeout Management
            _appState.IsTranslating = true;
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15)); // 15s timeout for API
            
            try
            {
                _logger.LogInformation(
                    "[TranslationTrigger] Source={Source} | PoiId={PoiId} | Lang={Lang}",
                    "Narration",
                    normalizedCode,
                    language);

                var translatedPoi = await _translationOrchestrator
                    .RequestTranslationAsync(normalizedCode, language, TranslationSource.Narration, cts.Token)
                    .ConfigureAwait(false);
                if (translatedPoi?.Localization != null)
                {
                    _locService.RegisterDynamicTranslation(normalizedCode, language, translatedPoi.Localization);
                    locResult = _locService.GetLocalizationResult(normalizedCode, language);
                }
            }
            catch (OperationCanceledException)
            {
                Debug.WriteLine($"[AUDIO] Translation timed out for {normalizedCode} ({language})");
                await MainThread.InvokeOnMainThreadAsync(async () => {
                    if (Microsoft.Maui.Controls.Application.Current?.Windows.FirstOrDefault()?.Page is Page page)
                        await page.DisplayAlert("Lỗi", "Quá trình dịch quá lâu hoặc kết nối kém. Thử lại sau.", "OK");
                });
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[AUDIO] Translation error for {normalizedCode}: {ex.Message}");
            }
            finally
            {
                _appState.IsTranslating = false;
            }
        }
        finally
        {
            _translationGate.Release();
        }

        return (PoiHydrationService.CreateHydratedPoi(poi, locResult), locResult);
    }

    /// <summary>
    /// Updates SelectedPoi and the Pois collection index on the main thread so the UI
    /// reflects any on-demand translation without requiring a full collection refresh.
    /// </summary>
    private async Task SyncUiAsync(Poi hydratedPoi)
    {
        await MainThread.InvokeOnMainThreadAsync(async () =>
        {
            // Update bottom panel if this is the currently selected POI
            if (_appState.SelectedPoi != null &&
                string.Equals(_appState.SelectedPoi.Code, hydratedPoi.Code, StringComparison.OrdinalIgnoreCase))
            {
                await _mapUi.ApplySelectedPoiAsync(MapUiSelectionSource.NarrationSync, hydratedPoi).ConfigureAwait(false);
            }

            // Update the map pin label in the Pois collection
            var idx = -1;
            for (int i = 0; i < _appState.Pois.Count; i++)
            {
                if (string.Equals(_appState.Pois[i].Code, hydratedPoi.Code, StringComparison.OrdinalIgnoreCase))
                {
                    idx = i;
                    break;
                }
            }
            if (idx >= 0) _appState.Pois[idx] = hydratedPoi;
        });
    }

    /// <summary>
    /// Resolves a core POI from the in-memory Pois collection, falling back to SQLite.
    /// </summary>
    private async Task<Poi?> ResolveCorePoi(string normalizedCode)
    {
        Poi? core = null;
        await MainThread.InvokeOnMainThreadAsync(() =>
        {
            core = _appState.Pois.FirstOrDefault(p => p.Code == normalizedCode);
        });

        if (core == null)
            core = await _poiQuery.GetByCodeAsync(normalizedCode).ConfigureAwait(false);

        return core;
    }

    private static string? SelectShortText(Poi poi)
        => !string.IsNullOrWhiteSpace(poi.Localization?.NarrationShort)
            ? poi.Localization!.NarrationShort
            : poi.Localization?.Name ?? "";

    private static string? SelectLongText(Poi poi)
        => !string.IsNullOrWhiteSpace(poi.Localization?.NarrationLong) ? poi.Localization!.NarrationLong
            : !string.IsNullOrWhiteSpace(poi.Localization?.NarrationShort) ? poi.Localization!.NarrationShort
            : poi.Localization?.Name ?? "";

    private async Task SpeakSafeAsync(string? poiCode, string text, string language)
    {
        try
        {
            await _audioService.SpeakAsync(poiCode ?? "", text, language);
            Debug.WriteLine($"[AUDIO] SpeakAsync returned for code={poiCode}");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[AUDIO] SpeakAsync ERROR for code={poiCode}: {ex.Message}");
        }
    }
}
