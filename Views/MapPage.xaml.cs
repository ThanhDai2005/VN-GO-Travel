using MauiApp1.Models;
using MauiApp1.ViewModels;
using Microsoft.Maui.Controls.Maps;
using Microsoft.Maui.Maps;

namespace MauiApp1.Views;

public partial class MapPage : ContentPage
{
    private readonly MapViewModel _vm;
    private PeriodicTimer? _timer;
    private bool _isTracking;
    private bool _poisDrawn;
    private CancellationTokenSource? _cts;
    private readonly Dictionary<Pin, Poi> _pinToPoi = new();
    private Pin? _userPin;
    private string? _lastAutoPoiId;

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
        BottomPanel.TranslationY = 300;
    }

    protected override void OnAppearing()
    {
        base.OnAppearing();
        _ = OnAppearingAsync();
    }

    private async Task OnAppearingAsync()
    {
        try
        {
            if (_isTracking) return;

            InitBottomPanel();

            await _vm.LoadPoisAsync();
            UpdateLanguageButtons();

            _isTracking = true;
            _cts = new CancellationTokenSource();
            _timer = new PeriodicTimer(TimeSpan.FromSeconds(5));

            _ = StartTrackingAsync(_cts.Token);
        }
        catch (Exception ex)
        {
            await DisplayAlertAsync("Error", ex.Message, "OK");
        }
    }

    protected override void OnDisappearing()
    {
        base.OnDisappearing();

        _isTracking = false;
        _poisDrawn = false;
        _lastAutoPoiId = null;
        _vm.SelectedPoi = null;

        _cts?.Cancel();
        _cts?.Dispose();
        _cts = null;

        _timer?.Dispose();
        _timer = null;

        _vm.StopAudio();
    }

    private async Task StartTrackingAsync(CancellationToken ct)
    {
        if (_timer == null) return;

        try
        {
            while (_timer != null && await _timer.WaitForNextTickAsync(ct))
            {
                await _vm.UpdateLocationAsync();

                var location = _vm.CurrentLocation;
                if (location == null) continue;

                var center = new Location(location.Latitude, location.Longitude);

                await MainThread.InvokeOnMainThreadAsync(() =>
                {
                    DrawUserLocation(center);
                });

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

                        await _vm.PlayPoiAsync(nearest.Poi, _vm.CurrentLanguage);
                    });
                }
                else if (nearest == null && _vm.SelectedPoi != null)
                {
                    _lastAutoPoiId = null;
                    _vm.SelectedPoi = null;

                    await MainThread.InvokeOnMainThreadAsync(async () =>
                    {
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
            }
        }
        catch (OperationCanceledException)
        {
        }
    }

    private void DrawUserLocation(Location location)
    {
        if (_userPin == null)
        {
            _userPin = new Pin
            {
                Label = _vm.CurrentLanguage == "en" ? "You are here" : "Bạn đang ở đây",
                Location = location,
                Type = PinType.Generic
            };

            Map.Pins.Add(_userPin);
        }
        else
        {
            _userPin.Label = _vm.CurrentLanguage == "en" ? "You are here" : "Bạn đang ở đây";
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
            var pin = new Pin
            {
                Label = poi.Name,
                Address = poi.Summary,
                Location = new Location(poi.Latitude, poi.Longitude),
                Type = PinType.Place
            };

            pin.MarkerClicked += OnPinMarkerClicked;

            Map.Pins.Add(pin);
            _pinToPoi[pin] = poi;

            Map.MapElements.Add(new Circle
            {
                Center = pin.Location,
                Radius = Distance.FromMeters(poi.Radius),
                StrokeColor = Colors.Blue,
                FillColor = Colors.LightBlue.WithAlpha(0.25f),
                StrokeWidth = 2
            });
        }
    }

    private async void OnPinMarkerClicked(object? sender, PinClickedEventArgs e)
    {
        if (sender is not Pin pin) return;
        if (!_pinToPoi.TryGetValue(pin, out var poi)) return;

        e.HideInfoWindow = true;

        await MainThread.InvokeOnMainThreadAsync(() =>
        {
            Map.MoveToRegion(
                MapSpan.FromCenterAndRadius(pin.Location, Distance.FromMeters(220)));
        });

        _vm.SelectedPoi = poi;
        _lastAutoPoiId = poi.Id;

        await ShowBottomPanelAsync();
        await _vm.PlayPoiAsync(poi, _vm.CurrentLanguage);
    }

    private async Task ShowBottomPanelAsync()
    {
        BottomPanel.AbortAnimation("TranslateTo");
        BottomPanel.AbortAnimation("FadeTo");

        if (!BottomPanel.IsVisible)
        {
            BottomPanel.TranslationY = 300;
            BottomPanel.Opacity = 0;
            BottomPanel.IsVisible = true;
        }

        await Task.WhenAll(
            BottomPanel.TranslateToAsync(0, 0, 250, Easing.CubicOut),
            BottomPanel.FadeToAsync(1, 200)
        );
    }

    private async Task HideBottomPanelAsync()
    {
        BottomPanel.AbortAnimation("TranslateTo");
        BottomPanel.AbortAnimation("FadeTo");

        await Task.WhenAll(
            BottomPanel.TranslateToAsync(0, 300, 200, Easing.CubicIn),
            BottomPanel.FadeToAsync(0, 150)
        );

        BottomPanel.IsVisible = false;
    }

    private async void OnListenDetailedClicked(object sender, EventArgs e)
    {
        if (_vm.SelectedPoi != null)
            await _vm.PlayPoiDetailedAsync(_vm.SelectedPoi, _vm.CurrentLanguage);
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

    private async Task ReloadLanguageAsync(string language)
    {
        _vm.SetLanguage(language);
        _vm.StopAudio();
        _vm.SelectedPoi = null;
        _lastAutoPoiId = null;

        if (BottomPanel.IsVisible)
            await HideBottomPanelAsync();

        _poisDrawn = false;

        await _vm.LoadPoisAsync(language);

        UpdateLanguageButtons();
        DrawPois();
    }

    private void UpdateLanguageButtons()
    {
        if (_vm.CurrentLanguage == "en")
        {
            EnglishButton.BackgroundColor = Color.FromArgb("#D94E2A");
            EnglishButton.TextColor = Colors.White;

            VietnameseButton.BackgroundColor = Color.FromArgb("#F4ECE7");
            VietnameseButton.TextColor = Color.FromArgb("#6A2C25");
        }
        else
        {
            VietnameseButton.BackgroundColor = Color.FromArgb("#D94E2A");
            VietnameseButton.TextColor = Colors.White;

            EnglishButton.BackgroundColor = Color.FromArgb("#F4ECE7");
            EnglishButton.TextColor = Color.FromArgb("#6A2C25");
        }
    }
}