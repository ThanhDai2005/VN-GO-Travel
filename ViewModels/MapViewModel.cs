using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Threading;
using System.Runtime.CompilerServices;
using System.Diagnostics;
using MauiApp1.ApplicationContracts.Providers;
using MauiApp1.ApplicationContracts.Services;
using MauiApp1.Models;
using MauiApp1.Services;
using MauiApp1.Services.MapUi;
using Microsoft.Maui.Devices.Sensors;
using System.Windows.Input;
using Microsoft.Maui.ApplicationModel;

namespace MauiApp1.ViewModels;

/// <summary>
/// UI coordinator for the Map screen.
///
/// After refactoring, this ViewModel's only responsibilities are:
///   - Exposing reactive properties that the MapPage binds to
///   - Subscribing to AppState events and forwarding PropertyChanged notifications to the UI
///   - Delegating business operations to the 4 domain services
///
/// WHAT MOVED OUT:
///   - POI loading / hydration   → <see cref="Services.PoiHydrationService"/>
///   - Audio narration           → <see cref="Services.PoiNarrationService"/>
///   - POI focus / pending-focus → <see cref="Services.PoiFocusService"/>
///   - Language switching        → <see cref="Services.LanguageSwitchService"/>
///
/// All public methods are preserved as delegates — zero binding breakage.
/// </summary>
public class MapViewModel : INotifyPropertyChanged
{
    // ── Injected services ─────────────────────────────────────────────────────
    private readonly ILocationProvider _locationService;
    private readonly IGeofenceArbitrationKernel _geofenceArbitrationKernel;
    private readonly IPreferredLanguageService _languagePrefs;
    private readonly INavigationService        _navService;
    private readonly AppState                  _appState;
    private readonly IMapUiStateArbitrator     _mapUi;

    // ── Domain services (the four extracted responsibilities) ─────────────────
    private readonly PoiHydrationService   _hydrationService;
    private readonly PoiNarrationService   _narrationService;
    private readonly PoiFocusService       _focusService;
    private readonly LanguageSwitchService _langSwitchService;

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    public MapViewModel(
        ILocationProvider locationService,
        IGeofenceArbitrationKernel geofenceArbitrationKernel,
        IPreferredLanguageService languagePrefs,
        INavigationService navService,
        AppState appState,
        IMapUiStateArbitrator mapUi,
        PoiHydrationService hydrationService,
        PoiNarrationService narrationService,
        PoiFocusService focusService,
        LanguageSwitchService langSwitchService)
    {
        _locationService   = locationService;
        _geofenceArbitrationKernel = geofenceArbitrationKernel;
        _languagePrefs     = languagePrefs;
        _navService        = navService;
        _appState          = appState;
        _mapUi             = mapUi;
        _hydrationService  = hydrationService;
        _narrationService  = narrationService;
        _focusService      = focusService;
        _langSwitchService = langSwitchService;

        // Initialize language from stored preference
        var initial = _languagePrefs.GetStoredOrDefault();
        if (_appState.CurrentLanguage != initial)
            _appState.CurrentLanguage = initial;

        // Reactive AppState subscriptions → propagate to UI via PropertyChanged
        _appState.SelectedPoiChanged += (s, poi) =>
        {
            OnPropertyChanged(nameof(SelectedPoi));
            OnPropertyChanged(nameof(IsPoiPanelVisible));
        };
        _appState.LanguageChanged += (s, lang) =>
        {
            OnPropertyChanged(nameof(CurrentLanguage));
            OnPropertyChanged(nameof(IsVietnamese));
            OnPropertyChanged(nameof(IsEnglish));
            OnPropertyChanged(nameof(CurrentLanguageLabel));
        };
        _appState.PoisChanged    += (s, e) => OnPropertyChanged(nameof(Pois));
        _appState.PropertyChanged += (s, e) =>
        {
            if (e.PropertyName == nameof(AppState.CurrentLocation))
                OnPropertyChanged(nameof(CurrentLocation));
            if (e.PropertyName == nameof(AppState.IsTranslating))
                OnPropertyChanged(nameof(IsTranslating));
        };

        // Forward PoisRefreshed from LanguageSwitchService to MapPage subscribers
        _langSwitchService.PoisRefreshed += (s, e) => PoisRefreshed?.Invoke(this, e);

        OpenQrCommand = new Command(async () =>
        {
            if (IsBusy) return;
            IsBusy = true;
            try
            {
                await _navService.NavigateToAsync("qrscan");
            }
            finally
            {
                IsBusy = false;
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Bindable properties (read from AppState — no local copies)
    // ─────────────────────────────────────────────────────────────────────────

    private bool _isBusy;
    public bool IsBusy
    {
        get => _isBusy;
        set
        {
            if (_isBusy == value) return;
            _isBusy = value;
            OnPropertyChanged();
        }
    }

    public string CurrentLanguage
    {
        get => _appState.CurrentLanguage;
        private set
        {
            if (_appState.CurrentLanguage != value)
            {
                _appState.CurrentLanguage = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(IsVietnamese));
                OnPropertyChanged(nameof(IsEnglish));
                OnPropertyChanged(nameof(CurrentLanguageLabel));
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

    public Location? CurrentLocation => _appState.CurrentLocation;

    public Poi? SelectedPoi
    {
        get => _appState.SelectedPoi;
        set
        {
            if (ReferenceEquals(_appState.SelectedPoi, value))
                return;

            _ = _mapUi.ApplySelectedPoiAsync(MapUiSelectionSource.DataBindingOrUnknown, value);
        }
    }

    public bool IsPoiPanelVisible => SelectedPoi != null;

    public bool IsTranslating => _appState.IsTranslating;

    public ObservableCollection<Poi> Pois => _appState.Pois;

    /// <summary>Raised after ApplyLanguageSelectionAsync refreshes the POI list (triggers map pin redraw).</summary>
    public event EventHandler? PoisRefreshed;

    public ICommand OpenQrCommand { get; }

    // ─────────────────────────────────────────────────────────────────────────
    // Delegates → Language switching (LanguageSwitchService)
    // ─────────────────────────────────────────────────────────────────────────

    public async Task ApplyLanguageSelectionAsync(string code)
    {
        if (IsBusy) return;
        IsBusy = true;
        try
        {
            await _langSwitchService.ApplyLanguageSelectionAsync(code);
        }
        finally
        {
            IsBusy = false;
        }
    }

    public void SetLanguage(string language)
        => _langSwitchService.SetLanguage(language);

    // ─────────────────────────────────────────────────────────────────────────
    // Delegates → POI focus (PoiFocusService)
    // ─────────────────────────────────────────────────────────────────────────

    public Task FocusOnPoiByCodeAsync(string code, string? lang = null)
        => _focusService.FocusOnPoiByCodeAsync(code, lang);

    public void RequestFocusOnPoiCode(string code, string? lang = null)
        => _focusService.RequestFocusOnPoiCode(code, lang);

    public (string? code, string? lang) ConsumePendingFocusRequest()
        => _focusService.ConsumePendingFocusRequest();

    // ─────────────────────────────────────────────────────────────────────────
    // Delegates → Audio narration (PoiNarrationService)
    // ─────────────────────────────────────────────────────────────────────────

    public Task PlayPoiAsync(Poi poi, string? lang = null)
        => _narrationService.PlayPoiAsync(poi, lang);

    public Task PlayPoiAsync(string poiCode, string? lang = null)
        => _narrationService.PlayPoiAsync(poiCode, lang);

    public Task PlayPoiDetailedAsync(Poi poi, string? lang = null)
        => _narrationService.PlayPoiDetailedAsync(poi, lang);

    public void StopAudio()
        => _narrationService.Stop();

    // ─────────────────────────────────────────────────────────────────────────
    // Delegates → POI loading (PoiHydrationService)
    // ─────────────────────────────────────────────────────────────────────────

    public Task LoadPoisAsync(string? preferredLanguage = null)
        => _hydrationService.LoadPoisAsync(preferredLanguage);

    /// <summary>Background pull of APPROVED POIs from API into SQLite (requires signed-in user).</summary>
    public Task SyncPoisFromServerAsync(CancellationToken cancellationToken = default)
        => _hydrationService.SyncPoisFromServerAsync(cancellationToken);

    // ─────────────────────────────────────────────────────────────────────────
    // Location polling — called by MapPage tracking loop
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Polls the device GPS and publishes the fix to <see cref="IGeofenceArbitrationKernel"/> (7.2.3),
    /// which owns UI-thread <see cref="AppState.CurrentLocation"/> updates and serialized geofence evaluation.
    /// Called on a periodic timer by <see cref="Views.MapPage"/>.
    /// </summary>
    public async Task UpdateLocationAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            var location = await _locationService.GetCurrentLocationAsync().ConfigureAwait(false);
            if (location == null) return;

            await _geofenceArbitrationKernel
                .PublishLocationAsync(location, "map", cancellationToken)
                .ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[MAP-VM] UpdateLocationAsync error: {ex.Message}");
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INotifyPropertyChanged
    // ─────────────────────────────────────────────────────────────────────────

    public event PropertyChangedEventHandler? PropertyChanged;
    private void OnPropertyChanged([CallerMemberName] string name = "")
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}