using System.ComponentModel;
using MauiApp1.Models;
using MauiApp1.Services;
using MauiApp1.Services.MapUi;
using MauiApp1.ViewModels;
using Microsoft.Maui.Controls.Maps;
using Microsoft.Maui.Maps;
using System.Diagnostics;

namespace MauiApp1.Views;

/// <summary>
/// Map-first QR entry: Shell navigates with <c>//map?code=&amp;lang=&amp;narrate=1</c> (see <see cref="MauiApp1.Services.PoiEntryCoordinator"/>).
/// </summary>
public partial class MapPage : ContentPage, IQueryAttributable
{
    private readonly MapViewModel _vm;
    private readonly LanguageSelectorViewModel _langSelectorVm;
    private readonly AppState _appState;
    private readonly INavigationService _navService;
    private readonly AuthService _auth;
    private readonly IMapUiStateArbitrator _mapUi;

    private bool _pendingNarrateAfterFocus;
    private PeriodicTimer? _timer;
    private CancellationTokenSource? _cts;

    private bool _isTracking;
    private bool _poisDrawn;
    private bool _isLoadingPois;

    private readonly Dictionary<Pin, Poi> _pinToPoi = new();
    private Pin? _userPin;

    private string? _lastAutoPoiId;
    private bool _isUserSelecting;

    public MapPage(MapViewModel vm, LanguageSelectorViewModel langSelectorVm, AppState appState, INavigationService navService, AuthService auth, IMapUiStateArbitrator mapUi)
    {
        InitializeComponent();
        BindingContext = _vm = vm;
        _langSelectorVm = langSelectorVm;
        _appState = appState;
        _navService = navService;
        _auth = auth;
        _mapUi = mapUi;

        InitBottomPanel();

        _vm.PoisRefreshed += (_, _) =>
        {
            MainThread.BeginInvokeOnMainThread(() =>
            {
                try
                {
                    DrawPois();
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[MAP-ERR] DrawPois after language change: {ex}");
                }
            });
        };

        Map.PropertyChanged += (s, e) =>
        {
            if (e.PropertyName == nameof(Map.VisibleRegion))
            {
                _appState.CurrentMapRegion = Map.VisibleRegion;
            }
        };
    }

    /// <summary>Shell query from coordinator: <c>code</c>, <c>lang</c>, optional <c>narrate=1</c> after QR scan.</summary>
    public void ApplyQueryAttributes(IDictionary<string, object> query)
    {
        try
        {
            if (query == null || !query.TryGetValue("code", out var codeObj) || codeObj == null)
                return;

            var rawCode = codeObj.ToString()?.Trim();
            if (string.IsNullOrWhiteSpace(rawCode))
                return;

            var code = Uri.UnescapeDataString(rawCode);

            string? lang = null;
            if (query.TryGetValue("lang", out var langObj) && langObj != null)
            {
                var ls = langObj.ToString()?.Trim();
                if (!string.IsNullOrWhiteSpace(ls))
                    lang = Uri.UnescapeDataString(ls);
            }

            var narrate = false;
            if (query.TryGetValue("narrate", out var narObj) && narObj != null)
            {
                var s = narObj.ToString();
                narrate = s == "1" || string.Equals(s, "true", StringComparison.OrdinalIgnoreCase);
            }

            _pendingNarrateAfterFocus = narrate;
            _vm.RequestFocusOnPoiCode(code, lang);
            Debug.WriteLine($"[MAP-QR] ApplyQuery code={code} lang={lang} narrate={narrate}");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[MAP-QR] ApplyQueryAttributes error: {ex}");
        }
    }

    private void InitBottomPanel()
    {
        BottomPanel.IsVisible = false;
        BottomPanel.Opacity = 0;
    }

    protected override void OnAppearing()
    {
        base.OnAppearing();
        _auth.PropertyChanged -= OnAuthPropertyChanged;
        _auth.PropertyChanged += OnAuthPropertyChanged;
        UpdatePlayAudioButtonText();
        _ = OnAppearingAsync();
    }

    private void OnAuthPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName is nameof(AuthService.IsAuthenticated))
            UpdatePlayAudioButtonText();
    }

    private void UpdatePlayAudioButtonText()
    {
        if (PlayAudioButton == null) return;
        PlayAudioButton.Text = _auth.IsAuthenticated ? "🔊 Nghe chi tiết" : "🔊 Nghe tóm tắt";
    }

    private async Task OnAppearingAsync()
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        Debug.WriteLine($"[MAP-TIME] OnAppearingAsync START");

        if (!_poisDrawn && !_isLoadingPois)
        {
            _isLoadingPois = true;
            InitBottomPanel();

            Debug.WriteLine($"[MAP-TIME] Starting LoadPoisAsync (background)");
            var loadTask = _vm.LoadPoisAsync();

            var pendingFocus = _vm.ConsumePendingFocusRequest();

            loadTask.ContinueWith(async t =>
            {
                try
                {
                    await MainThread.InvokeOnMainThreadAsync(() =>
                    {
                        try
                        {
                            if (!_poisDrawn)
                            {
                                DrawPois();
                                _poisDrawn = true;
                                Debug.WriteLine("[MAP-TIME] DrawPois invoked after LoadPoisAsync completion");
                            }
                        }
                        catch (Exception ex)
                        {
                            Debug.WriteLine($"[MAP-ERR] DrawPois after load: {ex}");
                        }
                        finally
                        {
                            _isLoadingPois = false;
                        }
                    });

                    try
                    {
                        await _vm.SyncPoisFromServerAsync().ConfigureAwait(false);
                        await MainThread.InvokeOnMainThreadAsync(() =>
                        {
                            try
                            {
                                DrawPois();
                                Debug.WriteLine("[MAP-TIME] DrawPois after server sync");
                            }
                            catch (Exception ex)
                            {
                                Debug.WriteLine($"[MAP-ERR] DrawPois after sync: {ex}");
                            }
                        });
                    }
                    catch (Exception ex)
                    {
                        Debug.WriteLine($"[MAP-ERR] SyncPoisFromServerAsync: {ex}");
                    }

                    if (!string.IsNullOrWhiteSpace(pendingFocus.code))
                    {
                        await MainThread.InvokeOnMainThreadAsync(async () =>
                        {
                            try
                            {
                                Debug.WriteLine($"[MAP-TIME] Performing pending focus after load code={pendingFocus.code} lang={pendingFocus.lang}");
                                await FocusOnPoiByCodeAsync(pendingFocus.code, pendingFocus.lang);
                            }
                            catch (Exception ex)
                            {
                                Debug.WriteLine($"[MAP-ERR] FocusOnPoiByCodeAsync after load: {ex}");
                            }
                        });
                    }
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[MAP-ERR] loadTask continuation: {ex}");
                }
            }, TaskScheduler.Default);
        }
        else
        {
            var pendingFocus = _vm.ConsumePendingFocusRequest();
            if (!string.IsNullOrWhiteSpace(pendingFocus.code))
            {
                Debug.WriteLine($"[MAP-TIME] Handling pending focus on already-drawn map: code={pendingFocus.code} narrate={_pendingNarrateAfterFocus}");
                await MainThread.InvokeOnMainThreadAsync(async () =>
                {
                    try
                    {
                        await FocusOnPoiByCodeAsync(pendingFocus.code, pendingFocus.lang);
                    }
                    catch (Exception ex)
                    {
                        Debug.WriteLine($"[MAP-ERR] Pending focus on already-drawn map: {ex}");
                    }
                });
            }
        }

        if (!_isTracking)
        {
            _isTracking = true;
            _cts = new CancellationTokenSource();
            _timer = new PeriodicTimer(TimeSpan.FromSeconds(5));

            Debug.WriteLine($"[MAP-TIME] Starting tracking loop");
            _ = StartTrackingAsync(_cts.Token);
        }

        sw.Stop();
        Debug.WriteLine($"[MAP-TIME] OnAppearingAsync END totalElapsed={sw.ElapsedMilliseconds} ms");
    }

    protected override void OnDisappearing()
    {
        base.OnDisappearing();
        _auth.PropertyChanged -= OnAuthPropertyChanged;

        _isTracking = false;
        _poisDrawn = false;
        _lastAutoPoiId = null;
        _isUserSelecting = false;

        _cts?.Cancel();
        _timer?.Dispose();

        _vm.StopAudio();
    }

    private async void OnMapClicked(object? sender, MapClickedEventArgs e)
    {
        _isUserSelecting = false;

        await _mapUi.ApplySelectedPoiAsync(MapUiSelectionSource.ManualMapBackgroundTap, null);
        _lastAutoPoiId = null;

        _vm.StopAudio();

        if (BottomPanel.IsVisible)
            await HideBottomPanelAsync();
    }

    private async Task StartTrackingAsync(CancellationToken ct)
    {
        if (_timer == null) return;

        var swLoop = System.Diagnostics.Stopwatch.StartNew();
        Debug.WriteLine("[MAP-TIME] StartTrackingAsync loop started");
        var firstIteration = true;

        try
        {
            while (await _timer.WaitForNextTickAsync(ct))
            {
                if (_appState.IsModalOpen)
                {
                    Debug.WriteLine("[MAP-TIME] Skipping tracking iteration: Modal UI is active.");
                    continue;
                }

                var iterStart = swLoop.ElapsedMilliseconds;
                await _vm.UpdateLocationAsync(ct);
                var iterAfterLocation = swLoop.ElapsedMilliseconds;

                if (firstIteration)
                {
                    Debug.WriteLine($"[MAP-TIME] First UpdateLocationAsync completed in {iterAfterLocation - iterStart} ms");
                    firstIteration = false;
                }

                // THREAD SAFETY: snapshot Pois before processing
                var location = _vm.CurrentLocation;
                if (location == null) continue;

                var center = new Location(location.Latitude, location.Longitude);

                await MainThread.InvokeOnMainThreadAsync(() =>
                {
                    DrawUserLocation(center);
                });

                if (_isUserSelecting) continue;

                // Take safe snapshot of Pois for distance calculation
                List<Poi> snapshot = new();
                await MainThread.InvokeOnMainThreadAsync(() =>
                {
                    snapshot = _vm.Pois.ToList();
                });

                var nearest = snapshot
                    .Select(p => new
                    {
                        Poi = p,
                        Distance = Location.CalculateDistance(
                            location,
                            new Location(p.Latitude, p.Longitude),
                            DistanceUnits.Kilometers) * 1000
                    })
                    .Where(x => x.Distance <= x.Poi.Radius)
                    .OrderByDescending(x => x.Poi.Priority)
                    .ThenBy(x => x.Distance)
                    .FirstOrDefault();

                if (nearest != null && _lastAutoPoiId != nearest.Poi.Id)
                {
                    _lastAutoPoiId = nearest.Poi.Id;
                    var autoPoi = nearest.Poi;
                    await MainThread.InvokeOnMainThreadAsync(async () =>
                    {
                        await _mapUi.ApplySelectedPoiAsync(MapUiSelectionSource.MapAutoProximity, autoPoi);
                        await ShowBottomPanelAsync();

                        Map.MoveToRegion(
                            MapSpan.FromCenterAndRadius(
                                new Location(autoPoi.Latitude, autoPoi.Longitude),
                                Distance.FromMeters(220)));

                        await _vm.PlayPoiAsync(autoPoi, _vm.CurrentLanguage);
                    });
                }
                else if (nearest == null && _vm.SelectedPoi != null)
                {
                    _isUserSelecting = false;

                    _lastAutoPoiId = null;

                    await MainThread.InvokeOnMainThreadAsync(async () =>
                    {
                        await _mapUi.ApplySelectedPoiAsync(MapUiSelectionSource.MapAutoProximity, null);
                        await HideBottomPanelAsync();
                        _vm.StopAudio();
                    });
                }

                if (!_poisDrawn)
                {
                    await MainThread.InvokeOnMainThreadAsync(() =>
                    {
                        DrawPois();

                        Map.MoveToRegion(
                            MapSpan.FromCenterAndRadius(center, Distance.FromMeters(500)));
                    });

                    _poisDrawn = true;
                }
                var iterEnd = swLoop.ElapsedMilliseconds;
                Debug.WriteLine($"[MAP-TIME] Tracking loop iteration elapsed={iterEnd - iterStart} ms");
            }
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception ex)
        {
            Console.WriteLine(ex);
        }
    }

    private void DrawUserLocation(Location location)
    {
        if (_userPin == null)
        {
            _userPin = new Pin
            {
                Label = "Ban dang o day",
                Location = location
            };

            Map.Pins.Add(_userPin);
        }
        else
        {
            _userPin.Location = location;
        }
    }

    private void DrawPois()
    {
        foreach (var pin in Map.Pins)
            pin.MarkerClicked -= OnPinMarkerClicked;

        Map.Pins.Clear();
        Map.MapElements.Clear();
        _pinToPoi.Clear();

        if (_userPin != null)
            Map.Pins.Add(_userPin);

        foreach (var poi in _vm.Pois)
        {
            var location = new Location(poi.Latitude, poi.Longitude);

            var pin = new Pin
            {
                Label = poi.Localization?.Name ?? "",
                Location = location
            };

            pin.MarkerClicked += OnPinMarkerClicked;

            Map.Pins.Add(pin);
            _pinToPoi[pin] = poi;

            Map.MapElements.Add(new Circle
            {
                Center = location,
                Radius = Distance.FromMeters(poi.Radius),
                StrokeColor = Colors.Red,
                FillColor = Colors.Red.WithAlpha(0.2f),
                StrokeWidth = 3
            });
        }
    }

    private async void OnPinMarkerClicked(object? sender, PinClickedEventArgs e)
    {
        if (sender is not Pin pin) return;
        if (!_pinToPoi.TryGetValue(pin, out var poi)) return;

        e.HideInfoWindow = true;

        _isUserSelecting = true;

        Map.MoveToRegion(
            MapSpan.FromCenterAndRadius(pin.Location, Distance.FromMeters(220)));

        await _mapUi.ApplySelectedPoiAsync(MapUiSelectionSource.ManualMapPinTap, poi);
        _lastAutoPoiId = poi.Id;

        await ShowBottomPanelAsync();
        await _vm.PlayPoiAsync(poi, _vm.CurrentLanguage);
    }

    private async Task FocusOnPoiByCodeAsync(string code, string? lang = null)
    {
        Debug.WriteLine($"[Map] FocusOnPoiByCodeAsync input code='{code}'");
        await _vm.FocusOnPoiByCodeAsync(code, lang);

        var poi = _vm.SelectedPoi;
        if (poi == null)
        {
            _pendingNarrateAfterFocus = false;
            Debug.WriteLine($"[Map] No POI found for code='{code}' in current language='{_vm.CurrentLanguage}'");
            return;
        }

        _isUserSelecting = true;
        _lastAutoPoiId = poi.Id;

        var location = new Location(poi.Latitude, poi.Longitude);

        await MainThread.InvokeOnMainThreadAsync(async () =>
        {
            Map.MoveToRegion(
                MapSpan.FromCenterAndRadius(location, Distance.FromMeters(220)));

            await ShowBottomPanelAsync();

            if (_pendingNarrateAfterFocus)
            {
                _pendingNarrateAfterFocus = false;
                await _vm.PlayPoiAsync(poi, lang ?? _vm.CurrentLanguage);
            }
        });
    }

    private async Task ShowBottomPanelAsync()
    {
        if (!BottomPanel.IsVisible)
        {
            BottomPanel.Opacity = 0;
            BottomPanel.IsVisible = true;
        }

        await BottomPanel.FadeToAsync(1, 200);
    }

    private async Task HideBottomPanelAsync()
    {
        await BottomPanel.FadeToAsync(0, 150);
        BottomPanel.IsVisible = false;
    }

    private async void OnListenDetailedClicked(object sender, EventArgs e)
    {
        var poi = _vm.SelectedPoi;
        if (poi == null) return;

        // Chưa đăng nhập: nút hiển thị "Nghe tóm tắt" — chỉ phát NarrationShort (không mở đăng nhập).
        if (!_auth.IsAuthenticated)
        {
            await _vm.PlayPoiAsync(poi, _vm.CurrentLanguage);
            return;
        }

        // Thuyết minh chi tiết (NarrationLong) chỉ trên map khi Premium — tránh lỗ hổng "Mở trên bản đồ" rồi nghe full chi tiết khi vẫn là user thường.
        if (!_auth.IsPremium)
        {
            var route = $"/poidetail?code={Uri.EscapeDataString(poi.Code)}&lang={Uri.EscapeDataString(_vm.CurrentLanguage)}";
            await _navService.NavigateToAsync(route);
            return;
        }

        await _vm.PlayPoiDetailedAsync(poi, _vm.CurrentLanguage);
    }

    private void OnStopAudioClicked(object sender, EventArgs e)
    {
        _vm.StopAudio();
    }

    private async void OnLanguageButtonClicked(object sender, EventArgs e)
    {
        var page = new LanguageSelectorPage(_langSelectorVm, _navService);
        await _navService.PushModalAsync(page, animated: true);
    }
}