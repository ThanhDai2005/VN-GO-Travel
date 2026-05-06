using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using MauiApp1.ApplicationContracts.Repositories;
using MauiApp1.Application.UseCases;
using MauiApp1.ApplicationContracts.Services;
using MauiApp1.Models;
using MauiApp1.Models.Entities;
using MauiApp1.Services;
using MauiApp1.Services.MapUi;
using MauiApp1.Messages;
using CommunityToolkit.Mvvm.Messaging;
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
    private readonly ITranslationResolverService _translationResolver;
    private readonly IUserEntitlementService _entitlementService;
    private readonly IAudioDownloadService _audioDownloadService;

    public System.Windows.Input.ICommand PurchaseZoneCommand { get; }
    public System.Windows.Input.ICommand PlayCommand { get; }
    public System.Windows.Input.ICommand StopCommand { get; }
    public System.Windows.Input.ICommand DownloadCommand { get; }
    public System.Windows.Input.ICommand PlayPurchasedAudioCommand { get; }
    public System.Windows.Input.ICommand PausePurchasedAudioCommand { get; }
    public System.Windows.Input.ICommand ReplayPurchasedAudioCommand { get; }

    private string? _lastLoadedCode;
    private bool    _languageListenerAttached;
    private CancellationTokenSource? _loadingCts;
    private string? _queryZoneCode;
    private string? _queryZoneName;

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
        ILoggerService logger,
        ITranslationResolverService translationResolver,
        IUserEntitlementService entitlementService,
        IAudioDownloadService audioDownloadService)
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
        _translationResolver = translationResolver;
        _entitlementService = entitlementService;
        _audioDownloadService = audioDownloadService;

        PurchaseZoneCommand = new Command(async () => await PurchaseZoneAsync());
        PlayCommand         = new Command(async () => await PlayDetailedAsync());
        StopCommand         = new Command(async () => await StopAsync());
        DownloadCommand     = new Command(async () => await DownloadAsync());
        PlayPurchasedAudioCommand = new Command(async () => await PlayPurchasedAudioAsync());
        PausePurchasedAudioCommand = new Command(() => _audioPlayer.Pause());
        ReplayPurchasedAudioCommand = new Command(async () =>
        {
            _audioPlayer.Seek(TimeSpan.Zero);
            await PlayPurchasedAudioAsync();
        });

        WeakReferenceMessenger.Default.Register<ZonePurchasedMessage>(this, async (_, m) =>
        {
            if (Poi == null || string.IsNullOrWhiteSpace(Poi.ZoneCode))
                return;

            if (!string.Equals(Poi.ZoneCode.Trim(), m.ZoneCode.Trim(), StringComparison.OrdinalIgnoreCase))
                return;

            await ReEvaluateAccessAsync().ConfigureAwait(false);
        });
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

    private DownloadedAudio? _downloadedAudio;
    public bool HasOfflineAudio => _downloadedAudio != null &&
                                   (!string.IsNullOrWhiteSpace(_downloadedAudio.AudioLongPath) ||
                                    !string.IsNullOrWhiteSpace(_downloadedAudio.AudioShortPath));
    public string AudioDurationText => _audioPlayer.Duration == TimeSpan.Zero ? "--:--" : _audioPlayer.Duration.ToString(@"mm\:ss");
    public string AudioPositionText => _audioPlayer.CurrentPosition == TimeSpan.Zero ? "00:00" : _audioPlayer.CurrentPosition.ToString(@"mm\:ss");
    public bool ShowPurchasedAudioPlayer => AccessState == PoiAccessState.Purchased;
    public bool ShowSummaryButton => true; // Luôn cho phép nghe tóm tắt
    public bool ShowDetailedCTA => AccessState != PoiAccessState.Purchased;
    public double AudioSeekValue
    {
        get
        {
            if (_audioPlayer.Duration.TotalSeconds <= 0) return 0;
            return _audioPlayer.CurrentPosition.TotalSeconds / _audioPlayer.Duration.TotalSeconds;
        }
        set
        {
            if (_audioPlayer.Duration.TotalSeconds <= 0) return;
            var pos = TimeSpan.FromSeconds(_audioPlayer.Duration.TotalSeconds * value);
            _audioPlayer.Seek(pos);
            OnPropertyChanged();
            OnPropertyChanged(nameof(AudioPositionText));
        }
    }

    private PoiAccessState _accessState = PoiAccessState.NotForSale;
    public PoiAccessState AccessState
    {
        get => _accessState;
        private set
        {
            if (_accessState == value) return;
            _accessState = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(HasZoneAccess));
            OnPropertyChanged(nameof(DoesNotHaveZoneAccess));
            OnPropertyChanged(nameof(ShowPurchaseBanner));
            OnPropertyChanged(nameof(PurchaseBannerTitle));
            OnPropertyChanged(nameof(PurchaseBannerDescription));
            OnPropertyChanged(nameof(DetailedActionButtonText));
            OnPropertyChanged(nameof(ShowPurchasedAudioPlayer));
            OnPropertyChanged(nameof(ShowDetailedCTA));
            OnPropertyChanged(nameof(ShowSummaryButton));
        }
    }

    public bool HasZoneAccess => AccessState == PoiAccessState.Purchased;

    public bool DoesNotHaveZoneAccess => !HasZoneAccess;
    public bool ShowPurchaseBanner => AccessState == PoiAccessState.NotLoggedIn || AccessState == PoiAccessState.NotPurchased;
    public string PurchaseBannerTitle => AccessState switch
    {
        PoiAccessState.NotLoggedIn => "Đăng nhập để mua",
        PoiAccessState.NotPurchased => "Mua khu vực để mở khóa",
        _ => string.Empty
    };
    public string PurchaseBannerDescription => AccessState switch
    {
        PoiAccessState.NotLoggedIn => "Bạn cần đăng nhập để mua khu vực và mở khóa thuyết minh chi tiết.",
        PoiAccessState.NotPurchased => "Sở hữu khu vực này để nghe thuyết minh chi tiết.",
        PoiAccessState.NotForSale => "POI chưa thuộc khu vực nào",
        _ => string.Empty
    };
    public string DetailedActionButtonText => AccessState switch
    {
        PoiAccessState.Purchased => "🎧 Nghe chi tiết",
        PoiAccessState.NotLoggedIn => "🔐 Đăng nhập để mua",
        PoiAccessState.NotPurchased => "🔒 Mua khu vực để nghe chi tiết",
        PoiAccessState.NotForSale => "ℹ POI chưa thuộc khu vực nào",
        _ => "🎧 Nghe chi tiết"
    };

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
                if (query.TryGetValue("zoneCode", out var z_cobj) && z_cobj is string z_code)
                    _queryZoneCode = z_code.Trim().ToUpperInvariant();
                if (query.TryGetValue("zoneName", out var z_nobj) && z_nobj is string z_name)
                    _queryZoneName = z_name.Trim();

                Debug.WriteLine($"[QR-NAV] PoiDetail ApplyQueryAttributes code='{l_code}' lang='{lang}'");

                // Cancel any existing loading task
                _loadingCts?.Cancel();
                _loadingCts?.Dispose();
                _loadingCts = new CancellationTokenSource();

                await LoadPoiAsync(l_code, lang, _loadingCts.Token);
                await ReEvaluateAccessAsync(_loadingCts.Token);
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

            // Attach localization from in-memory lookup as a baseline
            var locResult = _locService.GetLocalizationResult(_lastLoadedCode, effectiveLang);

            // RUNTIME RESOLUTION ENGINE (HYBRID)
            // Resolve content using backend translations and fallback rules
            var resolved = await _translationResolver.ResolvePoiContentAsync(new PoiDto
            {
                Code = core.Code,
                Name = core.Localization?.Name ?? "",
                Summary = core.Localization?.Summary ?? "",
                NarrationShort = core.Localization?.NarrationShort ?? "",
                NarrationLong = core.Localization?.NarrationLong ?? "",
                Version = core.Version,
                Translations = core.Translations
            }, effectiveLang).ConfigureAwait(false);

            // New Poi instance — ensures MAUI bindings update
            var poi = new Poi
            {
                Id        = core.Id,
                Code      = core.Code,
                Latitude  = core.Latitude,
                Longitude = core.Longitude,
                Radius    = core.Radius,
                Priority  = core.Priority,
                IsFallback = resolved.IsFallback,
                UsedLanguage = effectiveLang,
                RequestedLanguage = effectiveLang,
                ZoneCode = core.ZoneCode,
                ZoneName = core.ZoneName,
                SourceType = resolved.SourceType,
                ConfidenceScore = resolved.ConfidenceScore,
                ShowBadgeAutoTranslated = resolved.ShowBadgeAutoTranslated,
                ShowBadgeOutdated = resolved.ShowBadgeOutdated,
                Version = core.Version
            };

            // Trust explicit navigation zone context when local cache row is stale.
            if (string.IsNullOrWhiteSpace(poi.ZoneCode) && !string.IsNullOrWhiteSpace(_queryZoneCode))
            {
                poi.ZoneCode = _queryZoneCode;
                poi.ZoneName = string.IsNullOrWhiteSpace(_queryZoneName) ? poi.ZoneName : _queryZoneName;
            }
            
            poi.Localization = new PoiLocalization
            {
                Code = core.Code,
                LanguageCode = effectiveLang,
                Name = resolved.Name,
                Summary = resolved.Summary,
                NarrationShort = resolved.NarrationShort,
                NarrationLong = resolved.NarrationLong
            };

            await MainThread.InvokeOnMainThreadAsync(async () =>
            {
                Poi = poi;
                // Keep global state and MapViewModel in sync
                _mapVm?.RequestFocusOnPoiCode(code, effectiveLang);
                await _mapUi.ApplySelectedPoiAsync(MapUiSelectionSource.PoiDetailPageLoad, poi).ConfigureAwait(false);
            });

            await ReEvaluateAccessAsync(ct).ConfigureAwait(false);

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

    public async Task PlayShortNarrationAsync()
    {
        if (Poi == null) return;
        if (IsBusy) return;

        IsBusy = true;
        try
        {
            // Use narration service for TTS short narration
            var lang = _languagePrefs.GetStoredOrDefault();
            await _narrationService.PlayPoiAsync(Poi, lang).ConfigureAwait(false);
            
            OnPropertyChanged(nameof(IsPlaying));
            OnPropertyChanged(nameof(IsBuffering));
        }
        catch (Exception ex)
        {
            _logger.LogError("VM_PLAY_SHORT_FAILED", ex);
        }
        finally
        {
            IsBusy = false;
        }
    }

    public async Task PlayDetailedAsync()
    {
        if (Poi == null) return;
        if (IsBusy) return;

        if (!HasZoneAccess)
        {
            if (AccessState == PoiAccessState.NotForSale)
            {
                await MainThread.InvokeOnMainThreadAsync(async () =>
                {
                    var page = ResolveAlertPage();
                    if (page != null)
                        await page.DisplayAlertAsync("Thông báo", "POI chưa thuộc khu vực nào.", "OK");
                });
                return;
            }

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
            await PlayPurchasedAudioAsync().ConfigureAwait(false);
            
            OnPropertyChanged(nameof(IsPlaying));
            OnPropertyChanged(nameof(IsBuffering));
        }
        catch (Exception ex)
        {
            _logger.LogError("VM_PLAY_LONG_FAILED", ex);
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

    public async Task StopAsync()
    {
        _narrationService.Stop();
        await _audioPlayer.StopAsync().ConfigureAwait(false);
        OnPropertyChanged(nameof(IsPlaying));
    }

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

        // STEP 1: AUTH CHECK (BUG FIX)
        if (!_auth.IsAuthenticated)
        {
            await MainThread.InvokeOnMainThreadAsync(async () =>
            {
                var page = ResolveAlertPage();
                if (page != null)
                {
                    bool login = await page.DisplayAlertAsync(
                        "Yêu cầu đăng nhập", 
                        "Bạn cần đăng nhập tài khoản để thực hiện mua khu vực và mở khóa nội dung.", 
                        "Đăng nhập", 
                        "Để sau");
                    
                    if (login)
                    {
                        await Shell.Current.GoToAsync("login");
                    }
                }
            });
            return;
        }

        try
        {
            Debug.WriteLine($"[POI_DETAIL] Navigating to zone purchase for: {Poi.ZoneCode}");

            // First ensure we have the zone name if possible to pass along
            var zoneName = Poi.ZoneName ?? "Zone";

            // Navigate to Zone Purchase page correctly passing BOTH zoneCode and zoneName
            await Shell.Current.GoToAsync($"/zonepois?zoneCode={Uri.EscapeDataString(Poi.ZoneCode)}&zoneName={Uri.EscapeDataString(zoneName)}");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[POI_DETAIL] Navigation error: {ex}");
        }
    }

    public async Task ReEvaluateAccessAsync(CancellationToken ct = default)
    {
        var nextState = PoiAccessState.NotForSale;
        var zoneCode = Poi?.ZoneCode?.Trim();

        if (!string.IsNullOrWhiteSpace(zoneCode))
        {
            if (!_auth.IsAuthenticated)
            {
                nextState = PoiAccessState.NotLoggedIn;
            }
            else if (Poi != null)
            {
                var hasAccess = await _entitlementService.HasAccessToPoiAsync(Poi.Code, ct).ConfigureAwait(false);
                nextState = hasAccess ? PoiAccessState.Purchased : PoiAccessState.NotPurchased;
            }
        }

        await MainThread.InvokeOnMainThreadAsync(() => AccessState = nextState);
        await ResolveDownloadedAudioAsync(ct).ConfigureAwait(false);
    }

    private async Task ResolveDownloadedAudioAsync(CancellationToken ct = default)
    {
        if (Poi == null)
        {
            _downloadedAudio = null;
        }
        else
        {
            var lang = _languagePrefs.GetStoredOrDefault();
            _downloadedAudio = await _audioDownloadService.GetDownloadedAudioAsync(Poi.Code, lang, ct).ConfigureAwait(false)
                ?? await _audioDownloadService.GetDownloadedAudioAsync(Poi.Code, "en", ct).ConfigureAwait(false)
                ?? await _audioDownloadService.GetDownloadedAudioAsync(Poi.Code, "vi", ct).ConfigureAwait(false);
        }

        await MainThread.InvokeOnMainThreadAsync(() =>
        {
            OnPropertyChanged(nameof(HasOfflineAudio));
            OnPropertyChanged(nameof(ShowPurchasedAudioPlayer));
            OnPropertyChanged(nameof(AudioDurationText));
            OnPropertyChanged(nameof(AudioPositionText));
            OnPropertyChanged(nameof(AudioSeekValue));
        });
    }

    public async Task PlayPurchasedAudioAsync()
    {
        if (Poi == null) return;
        var lang = _languagePrefs.GetStoredOrDefault();

        if (HasZoneAccess && _downloadedAudio != null)
        {
            var local = !string.IsNullOrWhiteSpace(_downloadedAudio.AudioLongPath)
                ? _downloadedAudio.AudioLongPath
                : _downloadedAudio.AudioShortPath;

            if (!string.IsNullOrWhiteSpace(local) && File.Exists(local))
            {
                await _audioPlayer.PlayAsync(local, Poi.ZoneCode ?? "", CancellationToken.None).ConfigureAwait(false);
                return;
            }
        }

        if (HasZoneAccess)
            await _narrationService.PlayPoiDetailedAsync(Poi, lang).ConfigureAwait(false);
        else
            await _narrationService.PlayPoiAsync(Poi, lang).ConfigureAwait(false);
    }

    public void RefreshAudioUiState()
    {
        OnPropertyChanged(nameof(IsPlaying));
        OnPropertyChanged(nameof(IsBuffering));
        OnPropertyChanged(nameof(AudioPositionText));
        OnPropertyChanged(nameof(AudioDurationText));
        OnPropertyChanged(nameof(AudioSeekValue));
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
