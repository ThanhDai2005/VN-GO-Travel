using System.Diagnostics;
using MauiApp1.ApplicationContracts.Services;
using MauiApp1.Models;
using MauiApp1.Services.MapUi;

namespace MauiApp1.Services;

/// <summary>
/// Serializes all language-switch operations to prevent concurrent execution.
/// Extracted from MapViewModel where this was the <c>ApplyLanguageSelectionAsync</c> method
/// plus a <c>_langSwitchGate</c> SemaphoreSlim.
///
/// Responsibilities:
///   1. Acquire <c>_langSwitchGate</c> — concurrent callers queue up (BUG-4 fix).
///   2. Persist the new language via <see cref="IPreferredLanguageService"/>.
///   3. Stop in-flight audio.
///   4. Re-hydrate all in-memory POIs without a DB round-trip.
///   5. Re-resolve SelectedPoi to a new instance → MAUI binding updates correctly (BUG-3 fix).
///   6. Restart narration for the previously active POI in the new language (BUG-2 fix).
/// </summary>
public class LanguageSwitchService
{
    private readonly IPreferredLanguageService _languagePrefs;
    private readonly ILocalizationService _locService;
    private readonly PoiHydrationService       _hydrationService;
    private readonly PoiNarrationService       _narrationService;
    private readonly AppState                 _appState;
    private readonly IMapUiStateArbitrator    _mapUi;

    // Prevents concurrent execution of ApplyLanguageSelectionAsync (BUG-4 fix).
    private readonly SemaphoreSlim _langSwitchGate = new(1, 1);

    /// <summary>
    /// Raised after <see cref="ApplyLanguageSelectionAsync"/> refreshes the POI list.
    /// MapPage subscribes to this event to trigger map pin redraw.
    /// </summary>
    public event EventHandler? PoisRefreshed;

    public LanguageSwitchService(
        IPreferredLanguageService languagePrefs,
        ILocalizationService locService,
        PoiHydrationService hydrationService,
        PoiNarrationService narrationService,
        AppState appState,
        IMapUiStateArbitrator mapUi)
    {
        _languagePrefs    = languagePrefs;
        _locService       = locService;
        _hydrationService = hydrationService;
        _narrationService = narrationService;
        _appState         = appState;
        _mapUi            = mapUi;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Switches the active language. Serialized via <c>_langSwitchGate</c> — concurrent
    /// calls queue up rather than interleave.
    /// </summary>
    public async Task ApplyLanguageSelectionAsync(string code)
    {
        // Capture before StopAudio clears it
        var activeCodeBeforeSwitch = _appState.ActiveNarrationCode;

        Debug.WriteLine($"[LANG] Switch requested: {_appState.CurrentLanguage} → {code}");

        await _langSwitchGate.WaitAsync().ConfigureAwait(false);
        try
        {
            Debug.WriteLine($"[LANG] Switch executing: → {code}");

            var n = _languagePrefs.SetAndPersist(code);

            // Stop in-flight audio
            _narrationService.Stop();

            // THREAD SAFETY: Snapshot Pois collection on the main thread before
            // doing any background LINQ work to prevent enumeration race conditions.
            List<Poi> snapshot = new();
            await MainThread.InvokeOnMainThreadAsync(() =>
            {
                snapshot = _appState.Pois.ToList();
            });

            // Re-hydrate the snapshot off-thread (safe — snapshot is a plain List<T>)
            var rehydrated = snapshot
                .Select(p => PoiHydrationService.CreateHydratedPoi(p, _locService.GetLocalizationResult(p.Code, n)))
                .ToList();

            Debug.WriteLine($"[LANG] Re-hydrated {rehydrated.Count} POIs for lang='{n}'");

            await _hydrationService.RefreshPoisCollectionAsync(rehydrated);

            // THREAD SAFETY: All UI state changes must happen on the main thread
            await MainThread.InvokeOnMainThreadAsync(async () =>
            {
                _appState.CurrentLanguage = n;

                // Re-resolve SelectedPoi to a new instance with the new language (BUG-3 fix)
                if (_appState.SelectedPoi != null)
                {
                    var selectedCode = _appState.SelectedPoi.Code;
                    var newCore = rehydrated.FirstOrDefault(p => p.Code == selectedCode);
                    var newPoi = newCore != null
                        ? PoiHydrationService.CreateHydratedPoi(newCore, _locService.GetLocalizationResult(selectedCode, n))
                        : null;
                    await _mapUi.ApplySelectedPoiAsync(MapUiSelectionSource.LanguageRehydrate, newPoi).ConfigureAwait(false);
                    Debug.WriteLine($"[LANG] SelectedPoi re-resolved: code={selectedCode} null={newPoi == null}");
                }

                PoisRefreshed?.Invoke(this, EventArgs.Empty);
            });

            // Restart narration for the previously active POI in the new language (BUG-2 fix).
            if (!string.IsNullOrEmpty(activeCodeBeforeSwitch))
            {
                Debug.WriteLine($"[LANG] Restarting narration for POI='{activeCodeBeforeSwitch}' in lang='{n}'");
                await _narrationService.PlayPoiAsync(activeCodeBeforeSwitch, n).ConfigureAwait(false);
            }

            Debug.WriteLine($"[LANG] Switch complete: now '{n}'");
        }
        finally
        {
            _langSwitchGate.Release();
        }
    }

    /// <summary>
    /// Synchronous shortcut for direct language set (e.g. from deep link).
    /// Does NOT re-hydrate POIs — call <see cref="ApplyLanguageSelectionAsync"/> for a full switch.
    /// </summary>
    public void SetLanguage(string language)
    {
        var normalized = PreferredLanguageService.NormalizeCode(language);
        _languagePrefs.SetAndPersist(normalized);
        _appState.CurrentLanguage = normalized;
        Debug.WriteLine($"[LANG] SetLanguage (sync) → '{normalized}'");
    }
}
