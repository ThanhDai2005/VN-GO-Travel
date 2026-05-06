using System.Diagnostics;
using MauiApp1.ApplicationContracts.Repositories;
using MauiApp1.ApplicationContracts.Services;
using MauiApp1.Models;
using MauiApp1.Services.MapUi;
using MauiApp1.Services.Observability;
using Microsoft.Extensions.Logging;
using Microsoft.Maui.Networking;
using Microsoft.Maui.Controls;
using CommunityToolkit.Mvvm.Messaging;
using MauiApp1.Messages;

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
    private readonly IAudioQueueService _audioQueue;
    private readonly ILocalizationService _locService;
    private readonly TranslationQueueService _translationQueue;
    private readonly TranslationOrchestrator _translationOrchestrator;
    private readonly IPoiQueryRepository _poiQuery;
    private readonly AppState _appState;
    private readonly IMapUiStateArbitrator _mapUi;
    private readonly IZoneAccessService _zoneAccess;
    private readonly IRuntimeTelemetry _telemetry;
    private readonly ILogger<PoiNarrationService> _logger;
    private readonly SemaphoreSlim _translationGate = new(1, 1);
    private bool _isQueueMode = false;

    public PoiNarrationService(
        IAudioPlayerService audioService,
        IAudioQueueService audioQueue,
        ILocalizationService locService,
        TranslationOrchestrator translationOrchestrator,
        IPoiQueryRepository poiQuery,
        AppState appState,
        IMapUiStateArbitrator mapUi,
        TranslationQueueService translationQueue,
        IZoneAccessService zoneAccess,
        IRuntimeTelemetry telemetry,
        ILogger<PoiNarrationService> logger)
    {
        _audioService = audioService;
        _audioQueue = audioQueue;
        _locService = locService;
        _translationQueue = translationQueue;
        _translationOrchestrator = translationOrchestrator;
        _poiQuery = poiQuery;
        _appState = appState;
        _mapUi = mapUi;
        _zoneAccess = zoneAccess;
        _telemetry = telemetry;
        _logger = logger;

        // Subscribe to audio queue events
        _audioQueue.AudioStartRequested += OnAudioStartRequested;
        _audioQueue.QueueStatusUpdated += OnQueueStatusUpdated;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Plays short narration for <paramref name="poi"/>.
    /// Sets <c>AppState.ActiveNarrationCode</c> so a subsequent language switch can restart
    /// narration in the new language (BUG-2 fix).
    /// Uses audio queue if online and connected to prevent conflicts with other users.
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

        TrackNarrationInteraction(poi.Code, "audio_play_short");

        // Use queue if online and connected
        if (_audioQueue.IsConnected)
        {
            Debug.WriteLine($"[AUDIO] Using queue mode for {poi.Code}");
            _isQueueMode = true;
            await _audioQueue.JoinPoiAsync(normalizedCode);
            await _audioQueue.RequestAudioAsync(normalizedCode, language, "short");
        }
        else
        {
            Debug.WriteLine($"[AUDIO] Using direct mode (offline) for {poi.Code}");
            _isQueueMode = false;
            await SpeakSafeAsync(poi.Code, text, language);
        }
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
    /// Uses audio queue if online and connected to prevent conflicts with other users.
    /// </summary>
    public async Task PlayPoiDetailedAsync(Poi poi, string? lang = null)
    {
        // --- MANDATORY SERVICE LEVEL LOCKDOWN (TASK 1, 3, 6) ---
        await _zoneAccess.EnsureAccessAsync(poi.ZoneCode ?? "").ConfigureAwait(false);

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

        TrackNarrationInteraction(poi.Code, "audio_play_long");

        // Use queue if online and connected
        if (_audioQueue.IsConnected)
        {
            Debug.WriteLine($"[AUDIO] Using queue mode for {poi.Code} (long)");
            _isQueueMode = true;
            await _audioQueue.JoinPoiAsync(normalizedCode);
            await _audioQueue.RequestAudioAsync(normalizedCode, language, "long");
        }
        else
        {
            Debug.WriteLine($"[AUDIO] Using direct mode (offline) for {poi.Code} (long)");
            _isQueueMode = false;
            await SpeakSafeAsync(poi.Code, text, language);
        }
    }

    /// <summary>
    /// Stops any in-flight audio and clears the active narration POI tracking,
    /// so a subsequent language switch does NOT auto-restart audio.
    /// Also cancels queue entry if in queue mode.
    /// </summary>
    public void Stop()
    {
        var activeCode = _appState.ActiveNarrationCode;
        _appState.ActiveNarrationCode = null;
        _audioService.StopAsync().GetAwaiter().GetResult();

        // Cancel queue if in queue mode
        if (_isQueueMode && _audioQueue.IsConnected && !string.IsNullOrEmpty(activeCode))
        {
            _audioQueue.CancelAudioAsync(activeCode).GetAwaiter().GetResult();
        }

        Debug.WriteLine("[AUDIO] PoiNarrationService.Stop called — active narration tracking cleared");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Audio Queue Event Handlers
    // ─────────────────────────────────────────────────────────────────────────

    private async void OnAudioStartRequested(object? sender, AudioStartEventArgs e)
    {
        Debug.WriteLine($"[AUDIO] Queue signaled start for {e.PoiCode}");

        // Fetch POI and play audio
        var normalizedCode = e.PoiCode.Trim().ToUpperInvariant();
        var core = await ResolveCorePoi(normalizedCode);
        if (core == null)
        {
            Debug.WriteLine($"[AUDIO] Cannot play - POI not found: {e.PoiCode}");
            return;
        }

        var locResult = _locService.GetLocalizationResult(normalizedCode, e.Language);
        var poi = PoiHydrationService.CreateHydratedPoi(core, locResult);

        var text = e.NarrationLength == "long" ? SelectLongText(poi) : SelectShortText(poi);
        if (string.IsNullOrWhiteSpace(text))
        {
            Debug.WriteLine($"[AUDIO] No text for {e.PoiCode}");
            await _audioQueue.CompleteAudioAsync(e.PoiCode);
            return;
        }

        // Play audio
        await SpeakSafeAsync(e.PoiCode, text, e.Language);

        // Notify server that audio completed
        await _audioQueue.CompleteAudioAsync(e.PoiCode);
    }

    private void OnQueueStatusUpdated(object? sender, AudioQueueStatusEventArgs e)
    {
        Debug.WriteLine($"[AUDIO] Queue status update: {e.Status.TotalInQueue} users at {e.Status.PoiCode}");
        // UI can subscribe to this event to show queue position
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

            // 2. State & Queue Management
            poi.IsTranslating = true;
            var tcs = new TaskCompletionSource<bool>();
            
            // Subscribe to completion for this specific POI
            WeakReferenceMessenger.Default.Register<TranslationCompletedMessage>(this, (r, m) =>
            {
                if (m.Code == normalizedCode && m.Language == language)
                {
                    tcs.TrySetResult(true);
                    WeakReferenceMessenger.Default.Unregister<TranslationCompletedMessage>(this);
                }
            });

            _translationQueue.Enqueue(normalizedCode, language);

            try
            {
                // Wait for the message for up to 15s
                await tcs.Task.WaitAsync(TimeSpan.FromSeconds(15)).ConfigureAwait(false);
                
                // Re-fetch result after completion
                locResult = _locService.GetLocalizationResult(normalizedCode, language);
            }
            catch (TimeoutException)
            {
                Debug.WriteLine($"[AUDIO] Narration wait timed out for {normalizedCode}");
                WeakReferenceMessenger.Default.Unregister<TranslationCompletedMessage>(this);
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[AUDIO] Translation error for {normalizedCode}: {ex.Message}");
            }
            finally
            {
                poi.IsTranslating = false;
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

    /// <summary>
    /// Emits ROEL telemetry each time user intentionally plays POI narration.
    /// This enables heatmap intensity to grow with real usage behavior.
    /// </summary>
    private void TrackNarrationInteraction(string? poiCode, string action)
    {
        try
        {
            var loc = _appState.CurrentLocation;
            _telemetry.TryEnqueue(new RuntimeTelemetryEvent(
                RuntimeTelemetryEventKind.UiStateCommitted,
                DateTime.UtcNow.Ticks,
                producerId: "audio",
                latitude: loc?.Latitude,
                longitude: loc?.Longitude,
                poiCode: poiCode,
                routeOrAction: action,
                detail: $"action={action};poi={poiCode ?? ""}"));
        }
        catch
        {
            // telemetry must never break narration
        }
    }
}
