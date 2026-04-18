using System.Collections.ObjectModel;
using System.Diagnostics;
using MauiApp1.ApplicationContracts.Providers;
using MauiApp1.ApplicationContracts.Services;
using MauiApp1.Models;
using Microsoft.Extensions.Logging;

namespace MauiApp1.Services;

/// <summary>
/// Singleton service for managing all recurring background operations.
/// This centralizes loops for location tracking and content preloading,
/// ensuring they can be globally paused during app suspension or modal interaction.
/// </summary>
public class BackgroundTaskService
{
    private readonly ILocationProvider _locationService;
    private readonly IGeofenceArbitrationKernel _geofenceArbitrationKernel;
    private readonly IPoiTranslationService _poiTranslationService;
    private readonly ILocalizationService _locService;
    private readonly AppState _appState;
    private readonly ILogger<BackgroundTaskService> _logger;

    private CancellationTokenSource? _cts;
    private readonly object _lock = new();

    public BackgroundTaskService(
        ILocationProvider locationService,
        IGeofenceArbitrationKernel geofenceArbitrationKernel,
        IPoiTranslationService poiTranslationService,
        ILocalizationService locService,
        AppState appState,
        ILogger<BackgroundTaskService> logger)
    {
        _locationService = locationService;
        _geofenceArbitrationKernel = geofenceArbitrationKernel;
        _poiTranslationService = poiTranslationService;
        _locService = locService;
        _appState = appState;
        _logger = logger;
    }

    public void StartServices()
    {
        lock (_lock)
        {
            if (_cts != null) return;
            _cts = new CancellationTokenSource();
            var token = _cts.Token;

            // 1. Start Location / Geofence Evaluation Loop
            _ = Task.Run(() => RunLocationLoopAsync(token), token);

            // 2. Start POI Content Preloader (Translation) Loop
            _ = Task.Run(() => RunPreloaderLoopAsync(token), token);

            Debug.WriteLine("[BACK-SVC] Background services STARTED");
        }
    }

    public void StopServices()
    {
        lock (_lock)
        {
            if (_cts == null) return;
            _cts.Cancel();
            _cts.Dispose();
            _cts = null;
            Debug.WriteLine("[BACK-SVC] Background services STOPPED");
        }
    }

    private async Task RunLocationLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                // Wait between cycles
                await Task.Delay(5000, ct);

                if (_appState.IsModalOpen)
                {
                    Debug.WriteLine("[BACK-SVC] Location loop paused (Modal open)");
                    continue;
                }

                var loc = await _locationService.GetCurrentLocationAsync();
                if (loc != null)
                    await _geofenceArbitrationKernel.PublishLocationAsync(loc, "background", ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                Debug.WriteLine($"[BACK-SVC] Location loop error: {ex.Message}");
                await Task.Delay(2000, ct); // Cool down on error
            }
        }
    }

    private async Task RunPreloaderLoopAsync(CancellationToken ct)
    {
        // TEMP: Disabled for stabilization phase
        await Task.CompletedTask;
        return;

        while (!ct.IsCancellationRequested)
        {
            try
            {
                // Respect API rate limits and battery
                await Task.Delay(8000, ct);

                if (_appState.IsModalOpen) continue;

                var lang = _appState.CurrentLanguage;
                if (lang == "vi" || lang == "en") continue; // Baseline languages don't need translation

                if (_appState.IsTranslating) continue; // Don't interrupt foreground work

                // THREAD SAFETY: Snapshot Pois on the main thread before querying.
                Poi? target = null;
                await MainThread.InvokeOnMainThreadAsync(() =>
                {
                    target = _appState.Pois.FirstOrDefault(p => p.IsFallback);
                });
                if (target == null) continue;

                Debug.WriteLine($"[BACK-SVC] Preloading {target.Code} to {lang}...");

                _logger.LogInformation(
                    "[TranslationTrigger] Source={Source} | PoiId={PoiId} | Lang={Lang}",
                    "BackgroundPreload",
                    target.Code,
                    lang);

                var translatedPoi = await _poiTranslationService.GetOrTranslateAsync(target.Code, lang, ct);

                if (translatedPoi != null && translatedPoi.Localization != null && !ct.IsCancellationRequested)
                {
                    _locService.RegisterDynamicTranslation(target.Code, lang, translatedPoi.Localization);

                    // Update the POI in the global Pois collection on the main thread.
                    // IndexOf uses reference equality, which is safe here because target
                    // was captured from the same collection instance moments ago.
                    await MainThread.InvokeOnMainThreadAsync(() =>
                    {
                        var index = _appState.Pois.IndexOf(target);
                        if (index >= 0)
                        {
                            var locResult = _locService.GetLocalizationResult(target.Code, lang);
                            _appState.Pois[index] = CreateHydratedPoi(target, locResult);
                            Debug.WriteLine($"[BACK-SVC] Dynamic update for {target.Code}");
                        }
                    });
                }
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                Debug.WriteLine($"[BACK-SVC] Preloader loop error: {ex.Message}");
                await Task.Delay(5000, ct);
            }
        }
    }

    private static Poi CreateHydratedPoi(Poi core, LocalizationResult result)
    {
        var poi = new Poi
        {
            Id        = core.Id,
            Code      = core.Code,
            Latitude  = core.Latitude,
            Longitude = core.Longitude,
            Radius    = core.Radius,
            Priority  = core.Priority,
            IsFallback   = result.IsFallback,
            UsedLanguage = result.UsedLang,
            RequestedLanguage = result.RequestedLang
        };
        poi.Localization = result.Localization;
        return poi;
    }
}
