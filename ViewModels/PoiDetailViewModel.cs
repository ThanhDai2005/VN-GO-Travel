using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using MauiApp1.Models;
using MauiApp1.Services;
using Microsoft.Maui.ApplicationModel;
using Microsoft.Maui.Controls;

namespace MauiApp1.ViewModels;

public class PoiDetailViewModel : INotifyPropertyChanged, IQueryAttributable
{
    private readonly PoiDatabase              _db;
    private readonly LocalizationService      _locService;
    private readonly AudioService             _audioService;
    private readonly MapViewModel             _mapVm;
    private readonly IPreferredLanguageService _languagePrefs;

    private string? _lastLoadedCode;
    private bool    _languageListenerAttached;

    public PoiDetailViewModel(
        PoiDatabase db,
        LocalizationService locService,
        AudioService audioService,
        MapViewModel mapVm,
        IPreferredLanguageService languagePrefs)
    {
        _db            = db;
        _locService    = locService;
        _audioService  = audioService;
        _mapVm         = mapVm;
        _languagePrefs = languagePrefs;
    }

    // ── Language change listener ──────────────────────────────────────────────

    public void AttachPreferredLanguageListener()
    {
        if (_languageListenerAttached) return;
        _languagePrefs.PreferredLanguageChanged += OnPreferredLanguageChanged;
        _languageListenerAttached = true;
    }

    public void DetachPreferredLanguageListener()
    {
        if (!_languageListenerAttached) return;
        _languagePrefs.PreferredLanguageChanged -= OnPreferredLanguageChanged;
        _languageListenerAttached = false;
    }

    private async void OnPreferredLanguageChanged(object? sender, string lang)
    {
        if (string.IsNullOrWhiteSpace(_lastLoadedCode)) return;
        try
        {
            Debug.WriteLine($"[POI-DETAIL] Language changed to '{lang}', reloading code='{_lastLoadedCode}'");
            await LoadPoiAsync(_lastLoadedCode, lang).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[POI-DETAIL] Language reload error: {ex}");
        }
    }

    // ── Bindable properties ───────────────────────────────────────────────────

    private Poi? _poi;
    public Poi? Poi
    {
        get => _poi;
        set
        {
            _poi = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(OpenOnMapButtonText));
            OnPropertyChanged(nameof(PlayButtonText));
            OnPropertyChanged(nameof(StopButtonText));
        }
    }

    private bool _isNavigatingToMap;

    private bool _isBusy;
    public bool IsBusy
    {
        get => _isBusy;
        set { _isBusy = value; OnPropertyChanged(); }
    }

    // ── Shell query attributes ────────────────────────────────────────────────

    // Button UI should follow the current app UI language, not the POI fallback language.
    private string EffectiveLang => _mapVm.CurrentLanguage;

    public string OpenOnMapButtonText => EffectiveLang switch
    {
        "vi" => "🗺 Mở trên bản đồ",
        "en" => "🗺 Open on Map",
        "zh" => "🗺 在地图上打开",
        "ja" => "🗺 マップで開く",
        _ => "🗺 Open on Map"
    };

    public string PlayButtonText => EffectiveLang switch
    {
        "vi" => "🔊 Phát",
        "en" => "🔊 Play",
        "zh" => "🔊 播放",
        "ja" => "🔊 再生",
        _ => "🔊 Play"
    };

    public string StopButtonText => EffectiveLang switch
    {
        "vi" => "⏹ Dừng",
        "en" => "⏹ Stop",
        "zh" => "⏹ 停止",
        "ja" => "⏹ 停止",
        _ => "⏹ Stop"
    };

    public async void ApplyQueryAttributes(IDictionary<string, object> query)
    {
        if (query.TryGetValue("code", out var cobj) && cobj is string code)
        {
            string? lang = null;
            if (query.TryGetValue("lang", out var lobj) && lobj is string lstr)
                lang = lstr;

            Debug.WriteLine($"[QR-NAV] PoiDetail ApplyQueryAttributes code='{code}' lang='{lang}'");
            await LoadPoiAsync(code, lang);
            Debug.WriteLine($"[QR-NAV] PoiDetail ApplyQueryAttributes done Poi null?={Poi == null}");
        }
    }

    // ── Core load ────────────────────────────────────────────────────────────

    /// <summary>
    /// Loads a POI by code from the database and attaches localization from the
    /// in-memory <see cref="LocalizationService"/> — no PoiTranslationService call.
    /// </summary>
    public async Task LoadPoiAsync(string code, string? lang = null)
    {
        if (IsBusy) return;
        IsBusy = true;
        try
        {
            await _db.InitAsync().ConfigureAwait(false);

            // Initialize the localization lookup if it hasn't been loaded yet.
            // This is a no-op when MapViewModel.LoadPoisAsync() has already run,
            // but is REQUIRED here for paths where PoiDetailPage is the first screen
            // (e.g. QR deep link, external camera scan → open app → PoiDetail).
            await _locService.InitializeAsync().ConfigureAwait(false);

            _lastLoadedCode  = code.Trim().ToUpperInvariant();
            var effectiveLang = string.IsNullOrWhiteSpace(lang)
                ? _languagePrefs.GetStoredOrDefault()
                : lang.Trim().ToLowerInvariant();

            Debug.WriteLine($"[POI-DETAIL] LoadPoiAsync code='{_lastLoadedCode}' lang='{effectiveLang}'");

            // Fetch core geo data from SQLite
            var core = await _db.GetByCodeAsync(_lastLoadedCode).ConfigureAwait(false);
            if (core == null)
            {
                Debug.WriteLine($"[POI-DETAIL] No core POI found for code='{_lastLoadedCode}'");
                Poi = null;
                return;
            }

            // Attach localization from in-memory lookup (BUG-1 fix)
            var locResult = _locService.GetLocalizationResult(_lastLoadedCode, effectiveLang);
            Debug.WriteLine($"[POI-DETAIL] Localization found={locResult.Localization != null} name='{locResult.Localization?.Name}' fallback={locResult.IsFallback}");

            // New Poi instance — ensures MAUI bindings update (BUG-3 fix)
            var poi = new Poi
            {
                Id        = core.Id,
                Code      = core.Code,
                Latitude  = core.Latitude,
                Longitude = core.Longitude,
                Radius    = core.Radius,
                Priority  = core.Priority,
                IsFallback = locResult.IsFallback,
                UsedLanguage = locResult.UsedLang,
                RequestedLanguage = locResult.RequestedLang
            };
            poi.Localization = locResult.Localization;
            Poi = poi;

            // Keep global store and MapViewModel in sync
            var setLang = effectiveLang;
            _mapVm?.RequestFocusOnPoiCode(code, setLang);
            try
            {
                var store = (MauiApp1.Services.CurrentPoiStore?)
                    App.Current?.Handler?.MauiContext?.Services
                       .GetService(typeof(MauiApp1.Services.CurrentPoiStore));
                store?.SetCurrentPoi(code, setLang);
            }
            catch { }

            Debug.WriteLine($"[POI-DETAIL] LoadPoiAsync done Poi null?={Poi == null}");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[QR-ERR] PoiDetail LoadPoiAsync: {ex}");
        }
        finally
        {
            IsBusy = false;
        }
    }

    // ── Audio ─────────────────────────────────────────────────────────────────

    public async Task PlayAsync()
    {
        if (Poi == null) return;

        // Use current preferred language for TTS locale — not Poi.LanguageCode
        // (which may be stale if the user switched language after loading).
        var lang = _languagePrefs.GetStoredOrDefault();

        var text = !string.IsNullOrWhiteSpace(Poi.Localization?.NarrationLong)
            ? Poi.Localization.NarrationLong
            : (!string.IsNullOrWhiteSpace(Poi.Localization?.NarrationShort) ? Poi.Localization.NarrationShort : (Poi.Localization?.Name ?? ""));

        Debug.WriteLine($"[POI-DETAIL] PlayAsync lang={lang} textLen={text?.Length ?? 0}");

        if (!string.IsNullOrWhiteSpace(text))
            await _audioService.SpeakAsync(Poi.Code, text, lang);
    }

    public void Stop() => _audioService.Stop();

    // ── Navigation: open on map ───────────────────────────────────────────────

    public async Task OpenOnMapAsync()
    {
        if (Poi == null || string.IsNullOrWhiteSpace(Poi.Code))
        {
            Debug.WriteLine("[QR-NAV] OpenOnMapAsync skipped: no Poi/code");
            return;
        }

        if (_isNavigatingToMap)
        {
            Debug.WriteLine("[QR-NAV] OpenOnMapAsync skipped: already navigating");
            return;
        }

        _isNavigatingToMap = true;
        try
        {
            // Use current preferred language — not Poi.LanguageCode (BUG-5 fix)
            var lang = _languagePrefs.GetStoredOrDefault();
            _mapVm.RequestFocusOnPoiCode(Poi.Code, lang);

            Debug.WriteLine($"[MAP-NAV] OpenOnMapAsync navigating to //map code='{Poi.Code}' lang='{lang}'");
            await Shell.Current.GoToAsync("//map");
            Debug.WriteLine("[MAP-NAV] OpenOnMapAsync GoToAsync //map completed");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[QR-ERR] OpenOnMapAsync: {ex}");
        }
        finally
        {
            _isNavigatingToMap = false;
        }
    }

    // ── INotifyPropertyChanged ────────────────────────────────────────────────

    public event PropertyChangedEventHandler? PropertyChanged;
    private void OnPropertyChanged([CallerMemberName] string name = "")
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
