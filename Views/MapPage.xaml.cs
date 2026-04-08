using MauiApp1.Models;
using MauiApp1.ViewModels;
using Microsoft.Maui.Controls.Maps;
using Microsoft.Maui.Maps;
using System.Diagnostics;

namespace MauiApp1.Views;

public partial class MapPage : ContentPage
{
    private readonly MapViewModel _vm;
    private PeriodicTimer? _timer;
    private CancellationTokenSource? _cts;

    private bool _isTracking;
    private bool _poisDrawn;

    private readonly Dictionary<Pin, Poi> _pinToPoi = new();
    private Pin? _userPin;

    private string? _lastAutoPoiId;
    private bool _isUserSelecting;

    public MapPage(MapViewModel vm)
    {
        InitializeComponent();
        BindingContext = _vm = vm;

        InitBottomPanel();
        UpdateLanguageButtons();
    }

    private void InitBottomPanel()
    {
        BottomPanel.IsVisible = false;
        BottomPanel.Opacity = 0;
    }

    protected override void OnAppearing()
    {
        base.OnAppearing();
        _ = OnAppearingAsync();
    }

    private async Task OnAppearingAsync()
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        Debug.WriteLine($"[MAP-TIME] OnAppearingAsync START");

        // Capture pending focus before potentially redrawing POIs
        var pendingFocus = _vm.ConsumePendingFocusRequest();

        if (!_poisDrawn)
        {
            InitBottomPanel();

            Debug.WriteLine("[MAP-TIME] Await LoadPoisAsync before drawing pins");
            await _vm.LoadPoisAsync();

            await MainThread.InvokeOnMainThreadAsync(() =>
            {
                if (!_poisDrawn)
                {
                    DrawPois();
                    _poisDrawn = true;
                    Debug.WriteLine("[MAP-TIME] DrawPois invoked after LoadPoisAsync completion");
                }
            });

            UpdateLanguageButtons();
        }
        else
        {
            UpdateLanguageButtons();
        }

        if (!string.IsNullOrWhiteSpace(pendingFocus.code))
        {
            try
            {
                Debug.WriteLine($"[MAP-TIME] Performing pending focus after load code={pendingFocus.code} lang={pendingFocus.lang}");
                await FocusOnPoiByCodeAsync(pendingFocus.code!, pendingFocus.lang);
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[MAP-ERR] FocusOnPoiByCodeAsync after load: {ex}");
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

        _isTracking = false;
        _lastAutoPoiId = null;
        _isUserSelecting = false;

        _cts?.Cancel();
        _timer?.Dispose();

        _vm.StopAudio();
    }

    private async void OnMapClicked(object? sender, MapClickedEventArgs e)
    {
        _isUserSelecting = false;

        _vm.SelectedPoi = null;
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
                var iterStart = swLoop.ElapsedMilliseconds;
                await _vm.UpdateLocationAsync();
                var iterAfterLocation = swLoop.ElapsedMilliseconds;

                if (firstIteration)
                {
                    Debug.WriteLine($"[MAP-TIME] First UpdateLocationAsync completed in {iterAfterLocation - iterStart} ms");
                    firstIteration = false;
                }

                var location = _vm.CurrentLocation;
                if (location == null) continue;

                var center = new Location(location.Latitude, location.Longitude);

                await MainThread.InvokeOnMainThreadAsync(() =>
                {
                    DrawUserLocation(center);
                });

                if (_isUserSelecting) continue;

                var nearest = _vm.Pois
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
                    _vm.SelectedPoi = nearest.Poi;

                    await MainThread.InvokeOnMainThreadAsync(async () =>
                    {
                        await ShowBottomPanelAsync();

                        Map.MoveToRegion(
                            MapSpan.FromCenterAndRadius(
                                new Location(nearest.Poi.Latitude, nearest.Poi.Longitude),
                                Distance.FromMeters(220)));

                        await _vm.PlayPoiAsync(nearest.Poi, nearest.Poi.LanguageCode);
                    });
                }
                else if (nearest == null && _vm.SelectedPoi != null)
                {
                    _isUserSelecting = false;

                    _lastAutoPoiId = null;
                    _vm.SelectedPoi = null;

                    await MainThread.InvokeOnMainThreadAsync(async () =>
                    {
                        await HideBottomPanelAsync();
                        _vm.StopAudio();
                    });
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
                Label = _vm.UserLocationText,
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
                Label = poi.Name,
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

        _vm.SelectedPoi = poi;
        _lastAutoPoiId = poi.Id;

        await ShowBottomPanelAsync();
        await _vm.PlayPoiAsync(poi, poi.LanguageCode);
    }

    private async Task FocusOnPoiByCodeAsync(string code, string? lang = null)
    {
        Debug.WriteLine($"[Map] FocusOnPoiByCodeAsync input code='{code}'");
        await _vm.FocusOnPoiByCodeAsync(code, lang);

        var poi = _vm.SelectedPoi;
        if (poi == null)
        {
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

            // QR scan should immediately play the POI audio after focusing.
            await _vm.PlayPoiAsync(poi, poi.LanguageCode);
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
        if (_vm.SelectedPoi != null)
            await _vm.PlayPoiDetailedAsync(_vm.SelectedPoi, _vm.SelectedPoi.LanguageCode);
    }

    private void OnStopAudioClicked(object sender, EventArgs e)
    {
        _vm.StopAudio();
    }

    private async void OnVietnameseClicked(object sender, EventArgs e)
    {
        await ReloadLanguageAsync("vi");
    }

    private async void OnEnglishClicked(object sender, EventArgs e)
    {
        await ReloadLanguageAsync("en");
    }

    private async Task ReloadLanguageAsync(string lang)
    {
        _vm.SetLanguage(lang);
        _vm.StopAudio();

        _isUserSelecting = false;
        _lastAutoPoiId = null;
        _vm.SelectedPoi = null;

        await _vm.LoadPoisAsync(lang);

        UpdateLanguageButtons();
        DrawPois();
        _poisDrawn = true;
    }

    private void UpdateLanguageButtons()
    {
        // Selected background/text
        var selectedBg = Color.FromArgb("#D94E2A");
        var unselectedBg = Color.FromArgb("#F4ECE7");
        var selectedText = Colors.White;
        var unselectedText = Color.FromArgb("#6A2C25");

        // Reset
        foreach (var btn in new[] { VietnameseButton, EnglishButton, ChineseButton, JapaneseButton })
        {
            btn!.BackgroundColor = unselectedBg;
            btn.TextColor = unselectedText;
        }

        // Highlight active
        switch (_vm.CurrentLanguage)
        {
            case "en":
                EnglishButton.BackgroundColor = selectedBg;
                EnglishButton.TextColor = selectedText;
                break;
            case "zh":
                ChineseButton.BackgroundColor = selectedBg;
                ChineseButton.TextColor = selectedText;
                break;
            case "ja":
                JapaneseButton.BackgroundColor = selectedBg;
                JapaneseButton.TextColor = selectedText;
                break;
            case "vi":
            default:
                VietnameseButton.BackgroundColor = selectedBg;
                VietnameseButton.TextColor = selectedText;
                break;
        }
    }

    private async void OnChineseClicked(object sender, EventArgs e)
    {
        await ReloadLanguageAsync("zh");
    }

    private async void OnJapaneseClicked(object sender, EventArgs e)
    {
        await ReloadLanguageAsync("ja");
    }
}