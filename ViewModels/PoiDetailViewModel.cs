using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using MauiApp1.ApplicationContracts.Repositories;
using MauiApp1.Application.UseCases;
using MauiApp1.ApplicationContracts.Services;
using MauiApp1.Models;
using MauiApp1.Services;
using MauiApp1.Services.MapUi;
using Microsoft.Maui.ApplicationModel;
using Microsoft.Maui.Controls;

namespace MauiApp1.ViewModels;

public class PoiDetailViewModel : INotifyPropertyChanged, IQueryAttributable
{
    private readonly GetPoiDetailUseCase _getPoiDetailUseCase;
    private readonly PlayPoiAudioUseCase _playPoiAudioUseCase;
    private readonly ILocalizationService _locService;
    private readonly PoiNarrationService      _narrationService;
    private readonly MapViewModel             _mapVm;
    private readonly IPreferredLanguageService _languagePrefs;
    private readonly INavigationService      _navService;
    private readonly AppState                _appState;
    private readonly AuthService             _auth;
    private readonly IMapUiStateArbitrator    _mapUi;
    private readonly IZoneAccessService       _zoneAccessService;
    private readonly IAudioPlayerService     _audioPlayer;
    private readonly IZoneDownloadService    _downloadService;
    private readonly ILoggerService          _logger;

    public System.Windows.Input.ICommand PurchaseZoneCommand { get; }
    public System.Windows.Input.ICommand PlayCommand { get; }
    public System.Windows.Input.ICommand StopCommand { get; }
    public System.Windows.Input.ICommand DownloadCommand { get; }

    private string? _lastLoadedCode;
    private bool    _languageListenerAttached;
    private CancellationTokenSource? _loadingCts;

    public PoiDetailViewModel(
        GetPoiDetailUseCase getPoiDetailUseCase,
        PlayPoiAudioUseCase playPoiAudioUseCase,
        ILocalizationService locService,
        PoiNarrationService narrationService,
        MapViewModel mapVm,
        IPreferredLanguageService languagePrefs,
        INavigationService navService,
        AppState appState,
        AuthService auth,
        IMapUiStateArbitrator mapUi,
        IZoneAccessService zoneAccessService,
        IAudioPlayerService audioPlayer,
        IZoneDownloadService downloadService,
        ILoggerService logger)
    {
        _getPoiDetailUseCase = getPoiDetailUseCase;
        _playPoiAudioUseCase = playPoiAudioUseCase;
        _locService       = locService;
        _narrationService = narrationService;
        _mapVm            = mapVm;
        _languagePrefs    = languagePrefs;
        _navService       = navService;
        _appState         = appState;
        _auth             = auth;
        _mapUi            = mapUi;
        _zoneAccessService = zoneAccessService;
        _audioPlayer       = audioPlayer;
        _downloadService   = downloadService;
        _logger            = logger;

        PurchaseZoneCommand = new Command(async () => await PurchaseZoneAsync());
        PlayCommand         = new Command(async () => await PlayDetailedAsync());
        StopCommand         = new Command(async () => await StopAsync());
        DownloadCommand     = new Command(async () => await DownloadAsync());
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

    private bool _isBusy;
    public bool IsBusy
    {
        get => _isBusy;
        private set { _isBusy = value; OnPropertyChanged(); }
    }

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
            OnPropertyChanged(nameof(HasZoneAccess));
            OnPropertyChanged(nameof(DoesNotHaveZoneAccess));
            CheckDownloadStatus();
        }
    }

    public bool IsPlaying => _audioPlayer.IsPlaying;
    public bool IsBuffering => _audioPlayer.IsBuffering;
    
    private bool _isDownloaded;
    public bool IsDownloaded
    {
        get => _isDownloaded;
        private set { _isDownloaded = value; OnPropertyChanged(); }
    }

    private async void CheckDownloadStatus()
    {
        if (_poi == null || string.IsNullOrEmpty(_poi.ZoneCode)) return;
        IsDownloaded = await _downloadService.IsZoneDownloadedAsync(_poi.ZoneCode).ConfigureAwait(false);
    }

    public bool HasZoneAccess => _poi != null && _zoneAccessService.HasAccess(_poi.ZoneCode ?? string.Empty);

    public bool DoesNotHaveZoneAccess => !HasZoneAccess;

    // ── Shell query attributes ────────────────────────────────────────────────

    // Button UI should follow the current app UI language, not the POI fallback language.
    private string EffectiveLang => _appState.CurrentLanguage;

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
        try
        {
            if (query.TryGetValue("code", out var l_cobj) && l_cobj is string l_code)
            {
                string? lang = null;
                if (query.TryGetValue("lang", out var l_lobj) && l_lobj is string l_lstr)
                    lang = l_lstr;

                Debug.WriteLine($"[QR-NAV] PoiDetail ApplyQueryAttributes code='{l_code}' lang='{lang}'");

                // Cancel any existing loading task
                _loadingCts?.Cancel();
                _loadingCts?.Dispose();
                _loadingCts = new CancellationTokenSource();

                await LoadPoiAsync(l_code, lang, _loadingCts.Token);
                Debug.WriteLine($"[QR-NAV] PoiDetail ApplyQueryAttributes done Poi null?={Poi == null}");
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            Debug.WriteLine($"[POI-DETAIL] Entry error: {ex}");
        }
    }

    // ── Core load ────────────────────────────────────────────────────────────

    /// <summary>
    /// Loads a POI by code from the database and attaches localization from the
    /// in-memory <see cref="LocalizationService"/> — no PoiTranslationService call.
    /// </summary>
    public async Task LoadPoiAsync(string code, string? lang = null, CancellationToken ct = default)
    {
        if (IsBusy) return;
        IsBusy = true;
        try
        {
            // Ensure zone access service is initialized from DB
            await _zoneAccessService.InitializeAsync(ct).ConfigureAwait(false);
            
            // Initialize the localization lookup if it hasn't been loaded yet.
            await _locService.InitializeAsync().ConfigureAwait(false);
            ct.ThrowIfCancellationRequested();

            _lastLoadedCode  = code.Trim().ToUpperInvariant();
            var effectiveLang = string.IsNullOrWhiteSpace(lang)
                ? _languagePrefs.GetStoredOrDefault()
                : lang.Trim().ToLowerInvariant();

            Debug.WriteLine($"[POI-DETAIL] LoadPoiAsync code='{_lastLoadedCode}' lang='{effectiveLang}'");

            // Fetch core geo data using UseCase
            var core = await _getPoiDetailUseCase.ExecuteAsync(_lastLoadedCode, ct).ConfigureAwait(false);
            ct.ThrowIfCancellationRequested();

            if (core == null)
            {
                Debug.WriteLine($"[POI-DETAIL] No core POI found for code='{_lastLoadedCode}'");
                Poi = null;
                return;
            }

            // Attach localization from in-memory lookup
            var locResult = _locService.GetLocalizationResult(_lastLoadedCode, effectiveLang);

            // New Poi instance — ensures MAUI bindings update
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
                RequestedLanguage = locResult.RequestedLang,
                ZoneCode = core.ZoneCode,
                ZoneName = core.ZoneName
            };
            poi.Localization = locResult.Localization;

            await MainThread.InvokeOnMainThreadAsync(async () =>
            {
                Poi = poi;
                // Keep global state and MapViewModel in sync
                _mapVm?.RequestFocusOnPoiCode(code, effectiveLang);
                await _mapUi.ApplySelectedPoiAsync(MapUiSelectionSource.PoiDetailPageLoad, poi).ConfigureAwait(false);
            });

            Debug.WriteLine($"[POI-DETAIL] LoadPoiAsync completed for {_lastLoadedCode}");
        }
        catch (OperationCanceledException)
        {
            Debug.WriteLine($"[POI-DETAIL] Loading cancelled for {code}");
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

    public async Task PlayDetailedAsync()
    {
        if (Poi == null) return;
        if (IsBusy) return;

        if (!HasZoneAccess)
        {
            var wantPurchase = await MainThread.InvokeOnMainThreadAsync(async () =>
            {
                var page = ResolveAlertPage();
                if (page == null) return false;

                return await page.DisplayAlertAsync(
                    "✨ Khám phá câu chuyện chi tiết",
                    $"Bạn cần sở hữu khu vực '{Poi.ZoneName}' để có thể nghe bản thuyết minh chuyên sâu và những bí mật ẩn sau địa điểm này.",
                    "Mua ngay",
                    "Để sau");
            }).ConfigureAwait(false);

            if (wantPurchase) await PurchaseZoneAsync().ConfigureAwait(false);
            return;
        }

        IsBusy = true;
        try
        {
            _narrationService.Stop();
            await _audioPlayer.StopAsync().ConfigureAwait(false);

            var audioUrl = $"https://api.vngo.travel/audio/{Poi.Code}.mp3"; 
            await _audioPlayer.PlayAsync(audioUrl, Poi.ZoneCode ?? "").ConfigureAwait(false);
            
            OnPropertyChanged(nameof(IsPlaying));
            OnPropertyChanged(nameof(IsBuffering));
        }
        catch (Exception ex)
        {
            _logger.LogError("VM_PLAY_FAILED", ex);
        }
        finally
        {
            IsBusy = false;
        }
    }

    public async Task DownloadAsync()
    {
        if (Poi == null || string.IsNullOrEmpty(Poi.ZoneCode)) return;
        if (IsBusy) return;

        IsBusy = true;
        try
        {
            var poiCodes = new[] { Poi.Code };
            var audioUrls = new[] { $"https://api.vngo.travel/audio/{Poi.Code}.mp3" };

            await _downloadService.DownloadZoneAsync(Poi.ZoneCode, poiCodes, audioUrls).ConfigureAwait(false);
            CheckDownloadStatus();
        }
        catch (Exception ex)
        {
            _logger.LogError("VM_DOWNLOAD_FAILED", ex);
        }
        finally
        {
            IsBusy = false;
        }
    }

    public void Stop() => _narrationService.Stop();

    public async Task PurchaseZoneAsync()
    {
        if (Poi == null || string.IsNullOrEmpty(Poi.ZoneCode))
        {
            await MainThread.InvokeOnMainThreadAsync(async () =>
            {
                var page = ResolveAlertPage();
                if (page != null)
                {
                    await page.DisplayAlertAsync("Thông báo", "Địa danh này hiện chưa thuộc khu vực thanh toán nào.", "OK");
                }
            });
            return;
        }

        try
        {
            Debug.WriteLine($"[POI_DETAIL] Navigating to zone purchase for: {Poi.ZoneCode}");
            // Navigate to Zone Purchase page
            await Shell.Current.GoToAsync($"/zonepois?zoneCode={Uri.EscapeDataString(Poi.ZoneCode)}");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[POI_DETAIL] Navigation error: {ex}");
        }
    }

    /// <summary>Trang đang hiển thị (Shell push) — tránh Windows[0].Page không phải PoiDetail khiến alert không hiện.</summary>
    private static Page? ResolveAlertPage()
    {
        if (Shell.Current?.CurrentPage is Page shellPage)
            return shellPage;

        if (Microsoft.Maui.Controls.Application.Current?.Windows.Count > 0)
        {
            var w = Microsoft.Maui.Controls.Application.Current.Windows[0];
            if (w.Page is Page p)
                return p;
        }

        return null;
    }

    // ── Navigation: open on map ───────────────────────────────────────────────

    public async Task OpenOnMapAsync()
    {
        if (Poi == null || IsBusy)
        {
            Debug.WriteLine("[QR-NAV] OpenOnMapAsync skipped: no Poi or busy");
            return;
        }

        IsBusy = true;
        try
        {
            // Use current preferred language — not Poi.LanguageCode (BUG-5 fix)
            var lang = _languagePrefs.GetStoredOrDefault();
            _mapVm.RequestFocusOnPoiCode(Poi.Code, lang);

            Debug.WriteLine($"[MAP-NAV] OpenOnMapAsync navigating to //map code='{Poi.Code}' lang='{lang}'");
            await _navService.NavigateToAsync("//map");
            Debug.WriteLine("[MAP-NAV] OpenOnMapAsync GoToAsync //map completed");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[QR-ERR] OpenOnMapAsync: {ex}");
        }
        finally
        {
            IsBusy = false;
        }
    }

    // ── INotifyPropertyChanged ────────────────────────────────────────────────

    public event PropertyChangedEventHandler? PropertyChanged;
    private void OnPropertyChanged([CallerMemberName] string name = "")
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
