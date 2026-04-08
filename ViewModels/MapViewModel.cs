using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Diagnostics;
using Microsoft.Maui.ApplicationModel;
using Microsoft.Maui.Devices.Sensors;
using MauiApp1.Models;
using MauiApp1.Services;
using Microsoft.Maui.Controls;
using System.Windows.Input;

namespace MauiApp1.ViewModels;

public class MapViewModel : INotifyPropertyChanged
{
    private readonly LocationService         _locationService;
    private readonly GeofenceService         _geofenceService;
    private readonly PoiDatabase             _db;
    private readonly LocalizationService     _locService;
    private readonly AudioService            _audioService;
    private readonly IPreferredLanguageService _languagePrefs;
    private readonly IPoiTranslationService  _poiTranslationService;
    private          MauiApp1.Services.CurrentPoiStore _currentPoiStore;

    // ── Language switch serialisation ────────────────────────────────────────
    // Prevents concurrent execution of ApplyLanguageSelectionAsync (BUG-4 fix).
    private readonly SemaphoreSlim _langSwitchGate = new(1, 1);

    // ── Active narration tracking ─────────────────────────────────────────────
    // Code of the POI whose audio is currently playing (or was last played).
    // Cleared when StopAudio() is called explicitly, so language switch only
    // restarts audio if it was still running (not manually stopped).
    private string? _activeNarrationPoiCode;

    // ── Picker / language state ───────────────────────────────────────────────
    // _suppressLanguagePickerReload and _selectedLanguageOption are no longer needed
    // after migration to LanguageSelectorPage modal. Kept as comments for orientation.

    private string _currentLanguage = "en";
    public string CurrentLanguage
    {
        get => _currentLanguage;
        private set
        {
            if (_currentLanguage != value)
            {
                _currentLanguage = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(IsVietnamese));
                OnPropertyChanged(nameof(IsEnglish));
            }
        }
    }

    public bool IsVietnamese => CurrentLanguage == "vi";
    public bool IsEnglish    => CurrentLanguage == "en";

    /// <summary>Label shown on the MapPage toolbar language button (e.g. "🌐 Tiếng Việt").</summary>
    public string CurrentLanguageLabel
    {
        get
        {
            var info = PreferredLanguageService.SupportedLanguages
                           .FirstOrDefault(l => l.Code == CurrentLanguage);
            return info != null ? $"🌐 {info.NativeName}" : $"🌐 {CurrentLanguage.ToUpperInvariant()}";
        }
    }

    // ── Current location ─────────────────────────────────────────────────────
    private Location? _currentLocation;
    public Location? CurrentLocation
    {
        get => _currentLocation;
        private set { _currentLocation = value; OnPropertyChanged(); }
    }

    // ── Selected POI (bottom panel) ───────────────────────────────────────────
    private Poi? _selectedPoi;
    public Poi? SelectedPoi
    {
        get => _selectedPoi;
        set
        {
            if (_selectedPoi != value)
            {
                _selectedPoi = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(IsPoiPanelVisible));
            }
        }
    }

    public bool IsPoiPanelVisible => SelectedPoi != null;

    private bool _isTranslating;
    public bool IsTranslating
    {
        get => _isTranslating;
        private set { if (_isTranslating != value) { _isTranslating = value; OnPropertyChanged(); } }
    }

    public ObservableCollection<Poi> Pois { get; } = new();

    /// <summary>Raised after <see cref="ApplyLanguageSelectionAsync"/> refreshes the POI list (triggers map pin redraw).</summary>
    public event EventHandler? PoisRefreshed;

    private string? _pendingFocusPoiCode;
    private string? _pendingFocusPoiLang;

    public ICommand OpenQrCommand { get; }

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    public MapViewModel(
        LocationService locationService,
        GeofenceService geofenceService,
        PoiDatabase db,
        LocalizationService locService,
        AudioService audioService,
        IPreferredLanguageService languagePrefs,
        IPoiTranslationService poiTranslationService,
        CurrentPoiStore currentPoiStore)
    {
        _locationService = locationService;
        _geofenceService = geofenceService;
        _db              = db;
        _locService      = locService;
        _audioService    = audioService;
        _languagePrefs   = languagePrefs;
        _poiTranslationService = poiTranslationService;

        var initial = _languagePrefs.GetStoredOrDefault();
        CurrentLanguage = initial;
        _geofenceService.CurrentLanguage = CurrentLanguage;

        _currentPoiStore = currentPoiStore;
        InitializeCurrentPoiSubscription(_currentPoiStore);

        OpenQrCommand = new Command(async () =>
            await Shell.Current.GoToAsync("qrscan"));
            
        // Start intelligent background translator
        StartBackgroundPreloading();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Static helper
    // ─────────────────────────────────────────────────────────────────────────

    private static string FormatLanguageLabel(string code) => code switch
    {
        "en" => "English (en)",
        "vi" => "Tiếng Việt (vi)",
        "ja" => "日本語 (ja)",
        "ko" => "한국어 (ko)",
        "fr" => "Français (fr)",
        "zh" => "中文 (zh)",
        _    => code
    };

    /// <summary>
    /// Creates a NEW <see cref="Poi"/> instance that copies all geo/meta fields from
    /// <paramref name="core"/> and attaches <paramref name="loc"/> as its localization.
    /// <para>
    /// Creating a new object (rather than mutating) is critical: MAUI's binding engine
    /// only re-reads bound properties when <c>PropertyChanged("SelectedPoi")</c> fires,
    /// which only fires when <c>SelectedPoi</c> receives a <em>different</em> reference.
    /// Mutating the existing object's <c>Localization</c> silently stales the UI (BUG-3 fix).
    /// </para>
    /// </summary>
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
        poi.Localization = result.Localization; // set directly — avoids triggering bridge setters
        return poi;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Language management
    // ─────────────────────────────────────────────────────────────────────────

    private void SyncLanguagePickerSelection()
    {
        OnPropertyChanged(nameof(CurrentLanguageLabel));
    }

    /// <summary>
    /// Switches the active language:
    /// <list type="number">
    ///   <item>Serialised by <c>_langSwitchGate</c> — concurrent calls queue up (BUG-4 fix).</item>
    ///   <item>Re-hydrates all in-memory POIs without a DB round-trip.</item>
    ///   <item>Stops audio, then restarts narration for the active POI in the new language (BUG-2 fix).</item>
    ///   <item>Sets <c>SelectedPoi</c> to a new instance → MAUI binding updates correctly (BUG-3 fix).</item>
    /// </list>
    /// </summary>
    public async Task ApplyLanguageSelectionAsync(string code)
    {
        // Capture before StopAudio clears it
        var activeCodeBeforeSwitch = _activeNarrationPoiCode;

        Debug.WriteLine($"[LANG] Switch requested: {CurrentLanguage} → {code}");

        // Serialize concurrent switch requests (BUG-4 fix)
        await _langSwitchGate.WaitAsync().ConfigureAwait(false);
        try
        {
            Debug.WriteLine($"[LANG] Switch executing: → {code}");

            var n = _languagePrefs.SetAndPersist(code);
            CurrentLanguage = n;
            _geofenceService.CurrentLanguage = n;

            // Stop in-flight audio
            _audioService.Stop();
            _activeNarrationPoiCode = null;

            // Re-hydrate all in-memory POIs with the new language — NO DB reload.
            // Each Poi in Pois already has its geo data; we just swap the Localization.
            var rehydrated = Pois
                .Select(p => CreateHydratedPoi(p, _locService.GetLocalizationResult(p.Code, n)))
                .ToList();

            Debug.WriteLine($"[LANG] Re-hydrated {rehydrated.Count} POIs for lang='{n}'");

            await RefreshPoisCollectionAsync(rehydrated);

            // Update geofence atomically after Pois collection has been rebuilt,
            // so geofence never reads old language text (partial BUG-4 fix).
            _geofenceService.UpdatePois(rehydrated);

            // Re-resolve SelectedPoi to a new instance with the new language (BUG-3 fix)
            if (SelectedPoi != null)
            {
                var selectedCode = SelectedPoi.Code;
                var newCore = rehydrated.FirstOrDefault(p => p.Code == selectedCode);
                SelectedPoi = newCore != null
                    ? CreateHydratedPoi(newCore, _locService.GetLocalizationResult(selectedCode, n))
                    : null;
                Debug.WriteLine($"[LANG] SelectedPoi re-resolved: code={selectedCode} null={SelectedPoi == null}");
            }

            SyncLanguagePickerSelection();
            PoisRefreshed?.Invoke(this, EventArgs.Empty);

            // Restart narration for the previously active POI in the new language (BUG-2 fix).
            // Uses the code-string overload so it re-fetches localization fresh — no stale Poi reference.
            if (!string.IsNullOrEmpty(activeCodeBeforeSwitch))
            {
                Debug.WriteLine($"[LANG] Restarting narration for POI='{activeCodeBeforeSwitch}' in lang='{n}'");
                await PlayPoiAsync(activeCodeBeforeSwitch, n).ConfigureAwait(false);
            }

            Debug.WriteLine($"[LANG] Switch complete: now '{n}'");
        }
        finally
        {
            _langSwitchGate.Release();
        }
    }

    public void SetLanguage(string language)
    {
        var normalized = PreferredLanguageService.NormalizeCode(language);
        _languagePrefs.SetAndPersist(normalized);
        CurrentLanguage = normalized;
        _geofenceService.CurrentLanguage = CurrentLanguage;
        SyncLanguagePickerSelection();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Global POI store subscription
    // ─────────────────────────────────────────────────────────────────────────

    public void InitializeCurrentPoiSubscription(CurrentPoiStore store)
    {
        if (store == null) return;
        _currentPoiStore = store;
        _currentPoiStore.CurrentPoiChanged += async (poiCode, lang) =>
        {
            try
            {
                if (!string.IsNullOrWhiteSpace(poiCode))
                {
                    Debug.WriteLine($"[Map-VM] CurrentPoiStore event code={poiCode} lang={lang}");
                    var effectiveLang = string.IsNullOrWhiteSpace(lang) ? CurrentLanguage : lang;
                    await FocusOnPoiByCodeAsync(poiCode!, effectiveLang);
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[Map-VM] CurrentPoiStore handler error: {ex}");
            }
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POI focus
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Resolves a POI by code, attaches the correct localization, and sets
    /// <see cref="SelectedPoi"/> to a <em>new</em> instance (binding-safe).
    /// <para>
    /// Uses <see cref="LocalizationService"/> — does NOT call
    /// <c>PoiTranslationService</c> (which returns a core Poi with no text after
    /// the DB refactor — BUG-1 fix).
    /// </para>
    /// </summary>
    public async Task FocusOnPoiByCodeAsync(string code, string? lang = null)
    {
        if (string.IsNullOrWhiteSpace(code)) return;

        var normalizedCode = code.Trim().ToUpperInvariant();
        var preferred      = string.IsNullOrWhiteSpace(lang)
                             ? CurrentLanguage
                             : lang.Trim().ToLowerInvariant();

        Debug.WriteLine($"[Map-VM] FocusOnPoiByCodeAsync code={normalizedCode} lang={preferred}");

        IsTranslating = true;
        try
        {
            // Ensure localization lookup is ready — required when this is called before
            // LoadPoisAsync() runs (e.g. QR scan → Map tab is the first screen touched).
            await _locService.InitializeAsync().ConfigureAwait(false);

            // Prefer the already-loaded geo data from the in-memory Pois collection.
            // Avoid reading ObservableCollection from a background thread by doing the
            // lookup synchronously here then doing async DB fallback if needed.
            Poi? core = null;
            await MainThread.InvokeOnMainThreadAsync(() =>
            {
                core = Pois.FirstOrDefault(p => p.Code == normalizedCode);
            });

            if (core == null)
            {
                // POI not yet in the collection (e.g. QR scan before map finishes loading).
                await _db.InitAsync().ConfigureAwait(false);
                core = await _db.GetByCodeAsync(normalizedCode).ConfigureAwait(false);
            }

            if (core == null)
            {
                Debug.WriteLine($"[Map-VM] FocusOnPoiByCodeAsync: no POI found for code={normalizedCode}");
                return;
            }

            var locResult = _locService.GetLocalizationResult(normalizedCode, preferred);
            Debug.WriteLine($"[Map-VM] FocusOnPoiByCodeAsync: loc found={locResult.Localization != null} name='{locResult.Localization?.Name}' fallback={locResult.IsFallback}");

            // On-demand dynamic translation check
            if (locResult.IsFallback && preferred != "vi" && preferred != "en")
            {
                var translatedPoi = await _poiTranslationService.GetOrTranslateAsync(normalizedCode, preferred).ConfigureAwait(false);
                if (translatedPoi != null && translatedPoi.Localization != null)
                {
                    _locService.RegisterDynamicTranslation(normalizedCode, preferred, translatedPoi.Localization);
                    locResult = _locService.GetLocalizationResult(normalizedCode, preferred);
                    Debug.WriteLine($"[Map-VM] Dynamic translation activated for {normalizedCode}");
                }
            }

            // Always a new instance → fires PropertyChanged("SelectedPoi") → MAUI re-reads bindings (BUG-3 fix)
            SelectedPoi = CreateHydratedPoi(core, locResult);
        }
        finally
        {
            IsTranslating = false;
        }
    }

    public void RequestFocusOnPoiCode(string code, string? lang = null)
    {
        if (string.IsNullOrWhiteSpace(code)) return;
        _pendingFocusPoiCode = code.Trim().ToUpperInvariant();
        _pendingFocusPoiLang = string.IsNullOrWhiteSpace(lang) ? null : lang.Trim().ToLowerInvariant();
        Debug.WriteLine($"[Map-VM] Pending focus code='{_pendingFocusPoiCode}' lang='{_pendingFocusPoiLang}'");
    }

    public (string? code, string? lang) ConsumePendingFocusRequest()
    {
        var code = _pendingFocusPoiCode;
        var lang = _pendingFocusPoiLang;
        _pendingFocusPoiCode = null;
        _pendingFocusPoiLang = null;
        return (code, lang);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Location tracking
    // ─────────────────────────────────────────────────────────────────────────

    public async Task UpdateLocationAsync()
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var loc = await _locationService.GetCurrentLocationAsync();
        if (loc == null)
        {
            Debug.WriteLine($"[MAP-TIME] UpdateLocationAsync: location null ({sw.ElapsedMilliseconds} ms)");
            return;
        }

        CurrentLocation = loc;
        await _geofenceService.CheckLocationAsync(loc);
        Debug.WriteLine($"[MAP-TIME] UpdateLocationAsync: {sw.ElapsedMilliseconds} ms");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Audio playback
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Plays short narration for <paramref name="poi"/>.
    /// Sets <c>_activeNarrationPoiCode</c> so a subsequent language switch can restart
    /// narration in the new language (BUG-2 fix).
    /// This is the <strong>single audio entry-point</strong> for both the Map pin-tap
    /// flow and the QR scan flow — no other code should call AudioService directly.
    /// </summary>
    public async Task PlayPoiAsync(Poi poi, string? lang = null)
    {
        var language = string.IsNullOrWhiteSpace(lang) ? CurrentLanguage : lang.Trim().ToLowerInvariant();

        // Track before speak so language-switch restart knows which POI is active.
        _activeNarrationPoiCode = poi.Code;
        Debug.WriteLine($"[AUDIO] PlayPoiAsync: code={poi.Code} lang={language} _activeNarrationPoiCode='{_activeNarrationPoiCode}'");

        // Always read text via bridge (which reads poi.Localization).
        // The passed Poi is always a hydrated instance from FocusOnPoiByCodeAsync or
        // the rehydrated collection in ApplyLanguageSelectionAsync — never a bare core Poi.
        var text = !string.IsNullOrWhiteSpace(poi.Localization?.NarrationShort)
            ? poi.Localization.NarrationShort
            : poi.Localization?.Name ?? "";

        Debug.WriteLine($"[AUDIO] PlayPoiAsync: textLen={text?.Length ?? 0} text='{text?.Substring(0, Math.Min(60, text?.Length ?? 0))}'");

        if (string.IsNullOrWhiteSpace(text))
        {
            Debug.WriteLine($"[AUDIO] PlayPoiAsync: SKIPPED — no narration text for code={poi.Code} lang={language}");
            return;
        }

        try
        {
            await _audioService.SpeakAsync(poi.Code, text, language);
            Debug.WriteLine($"[AUDIO] PlayPoiAsync: SpeakAsync returned for code={poi.Code}");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[AUDIO] PlayPoiAsync: ERROR for code={poi.Code}: {ex.Message}");
        }
    }

    /// <summary>
    /// Overload that resolves the POI by <paramref name="poiCode"/> using the in-memory lookup
    /// before playing. Useful when only the code is available (e.g. QR restart after language switch).
    /// </summary>
    public async Task PlayPoiAsync(string poiCode, string? lang = null)
    {
        if (string.IsNullOrWhiteSpace(poiCode)) return;

        var normalizedCode = poiCode.Trim().ToUpperInvariant();
        var language       = string.IsNullOrWhiteSpace(lang) ? CurrentLanguage : lang.Trim().ToLowerInvariant();

        Debug.WriteLine($"[AUDIO] PlayPoiAsync(code): code={normalizedCode} lang={language}");

        // Find core geo data from the in-memory collection (already loaded).
        Poi? core = null;
        await MainThread.InvokeOnMainThreadAsync(() =>
        {
            core = Pois.FirstOrDefault(p => p.Code == normalizedCode);
        });

        if (core == null)
        {
            // Fallback: DB
            core = await _db.GetByCodeAsync(normalizedCode).ConfigureAwait(false);
        }

        if (core == null)
        {
            Debug.WriteLine($"[AUDIO] PlayPoiAsync(code): no POI found for code={normalizedCode}");
            return;
        }

        // Fetch fresh localization — guarantees the text is in the requested language
        // even if the Poi in the collection still has the old Localization attached.
        var locResult = _locService.GetLocalizationResult(normalizedCode, language);
        var poi = CreateHydratedPoi(core, locResult);

        await PlayPoiAsync(poi, language);
    }

    /// <summary>
    /// Plays the long narration (detailed) for <paramref name="poi"/>.
    /// Also tracks active POI for language-switch restart.
    /// </summary>
    public async Task PlayPoiDetailedAsync(Poi poi, string? lang = null)
    {
        var language = string.IsNullOrWhiteSpace(lang) ? CurrentLanguage : lang.Trim().ToLowerInvariant();
        _activeNarrationPoiCode = poi.Code;
        Debug.WriteLine($"[AUDIO] PlayPoiDetailedAsync: code={poi.Code} lang={language} _activeNarrationPoiCode='{_activeNarrationPoiCode}'");

        var text = !string.IsNullOrWhiteSpace(poi.Localization?.NarrationLong)
            ? poi.Localization.NarrationLong
            : (!string.IsNullOrWhiteSpace(poi.Localization?.NarrationShort) ? poi.Localization.NarrationShort : (poi.Localization?.Name ?? ""));

        Debug.WriteLine($"[AUDIO] PlayPoiDetailedAsync: textLen={text?.Length ?? 0}");

        if (string.IsNullOrWhiteSpace(text))
        {
            Debug.WriteLine($"[AUDIO] PlayPoiDetailedAsync: SKIPPED — no narration text for code={poi.Code} lang={language}");
            return;
        }

        try
        {
            await _audioService.SpeakAsync(poi.Code, text, language);
            Debug.WriteLine($"[AUDIO] PlayPoiDetailedAsync: SpeakAsync returned for code={poi.Code}");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[AUDIO] PlayPoiDetailedAsync: ERROR for code={poi.Code}: {ex.Message}");
        }
    }

    /// <summary>
    /// Stops any in-flight audio and clears the active narration POI tracking,
    /// so a subsequent language switch does NOT auto-restart audio.
    /// </summary>
    public void StopAudio()
    {
        _activeNarrationPoiCode = null;
        _audioService.Stop();
        Debug.WriteLine("[AUDIO] StopAudio called — active narration tracking cleared");
    }


    // ─────────────────────────────────────────────────────────────────────────
    // POI collection management
    // ─────────────────────────────────────────────────────────────────────────

    private async Task RefreshPoisCollectionAsync(List<Poi> items)
    {
        await MainThread.InvokeOnMainThreadAsync(() =>
        {
            Pois.Clear();
            foreach (var poi in items)
                Pois.Add(poi);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Initial load
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Loads POIs from SQLite (seeding from <c>pois.json</c> on first run) and
    /// attaches localization for <paramref name="preferredLanguage"/> from the
    /// in-memory <see cref="LocalizationService"/> lookup.
    /// <para>
    /// Called once on app start. Language switching does NOT call this method —
    /// it uses <see cref="ApplyLanguageSelectionAsync"/> which re-hydrates
    /// in-memory objects without any DB or JSON I/O.
    /// </para>
    /// </summary>
    public async Task LoadPoisAsync(string? preferredLanguage = null)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        Debug.WriteLine("[MAP-LOAD] LoadPoisAsync START");

        await _db.InitAsync().ConfigureAwait(false);

        var targetLang = string.IsNullOrWhiteSpace(preferredLanguage)
            ? CurrentLanguage
            : PreferredLanguageService.NormalizeCode(preferredLanguage);

        // Initialize the localization lookup (no-op after first call).
        var tLocStart = sw.ElapsedMilliseconds;
        await _locService.InitializeAsync().ConfigureAwait(false);
        Debug.WriteLine($"[MAP-LOAD]  locService init: {sw.ElapsedMilliseconds - tLocStart} ms");

        // Seed database if empty (first install or fresh clear).
        var tSeedStart = sw.ElapsedMilliseconds;
        var existingCount = await _db.GetCountAsync().ConfigureAwait(false);
        if (existingCount == 0)
        {
            Debug.WriteLine("[MAP-LOAD] DB empty — seeding core POI data from pois.json");
            var corePois = _locService.GetCorePoisForSeeding();
            await _db.InsertManyAsync(corePois).ConfigureAwait(false);
            Debug.WriteLine($"[MAP-LOAD] Seeded {corePois.Count} core POIs into SQLite");
        }
        Debug.WriteLine($"[MAP-LOAD]  seed check: {sw.ElapsedMilliseconds - tSeedStart} ms");

        // Load all geo-only rows from SQLite.
        var tDbStart = sw.ElapsedMilliseconds;
        var poisFromDb = await _db.GetAllAsync().ConfigureAwait(false);
        Debug.WriteLine($"[MAP-LOAD]  DB fetch {poisFromDb.Count} rows: {sw.ElapsedMilliseconds - tDbStart} ms");

        // Hydrate each core Poi with localization for the target language.
        var tHydrateStart = sw.ElapsedMilliseconds;
        var hydrated = poisFromDb
            .Select(p => CreateHydratedPoi(p, _locService.GetLocalizationResult(p.Code, targetLang)))
            .ToList();

        var missing = hydrated.Count(p => p.Localization == null);
        Debug.WriteLine(
            $"[MAP-LOAD]  hydration: {sw.ElapsedMilliseconds - tHydrateStart} ms  " +
            $"hydrated={hydrated.Count}  missing_loc={missing}");

        CurrentLanguage = targetLang;
        _geofenceService.CurrentLanguage = CurrentLanguage;
        SyncLanguagePickerSelection();

        await RefreshPoisCollectionAsync(hydrated);
        _geofenceService.UpdatePois(hydrated);

        Debug.WriteLine($"[MAP-LOAD] LoadPoisAsync END total={sw.ElapsedMilliseconds} ms");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Background Translation Preloading
    // ─────────────────────────────────────────────────────────────────────────

    private bool _isPreloaderRunning = false;

    /// <summary>
    /// Translates visible/nearby POIs automatically while the user is idle.
    /// This improves perceived performance since the cache will be hot when the user taps them.
    /// </summary>
    public void StartBackgroundPreloading()
    {
        if (_isPreloaderRunning) return;
        _isPreloaderRunning = true;

        Task.Run(async () =>
        {
            while (true)
            {
                await Task.Delay(5000); // Wait 5s between checks (respect API limits)

                if (IsVietnamese || IsEnglish) continue; // Native, no translation needed
                if (IsTranslating) continue; // Don't interrupt foreground translation

                // Find a POI that is still using a fallback text
                Poi? target = null;
                await MainThread.InvokeOnMainThreadAsync(() =>
                {
                    target = Pois.FirstOrDefault(p => p.IsFallback);
                });

                if (target == null) continue; // All translated

                var lang = CurrentLanguage;
                try
                {
                    Debug.WriteLine($"[PRELOADER] Background translating {target.Code} to {lang}...");
                    var translatedPoi = await _poiTranslationService.GetOrTranslateAsync(target.Code, lang).ConfigureAwait(false);
                    
                    if (translatedPoi != null && translatedPoi.Localization != null)
                    {
                        _locService.RegisterDynamicTranslation(target.Code, lang, translatedPoi.Localization);

                        // Re-hydrate the single POI on the main thread so the Map updates silently
                        await MainThread.InvokeOnMainThreadAsync(() =>
                        {
                            var index = Pois.IndexOf(target);
                            if (index >= 0)
                            {
                                var freshLoc = _locService.GetLocalizationResult(target.Code, lang);
                                Pois[index] = CreateHydratedPoi(target, freshLoc);
                                Debug.WriteLine($"[PRELOADER] Silent map update for {target.Code}");
                            }
                        });
                    }
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[PRELOADER] Failed: {ex.Message}");
                }
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INotifyPropertyChanged
    // ─────────────────────────────────────────────────────────────────────────

    public event PropertyChangedEventHandler? PropertyChanged;
    private void OnPropertyChanged([CallerMemberName] string name = "")
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}