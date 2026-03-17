using MauiApp1.Models;
using MauiApp1.ViewModels;
using Microsoft.Maui.Controls.Maps;
using Microsoft.Maui.Maps;

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

    public MapPage(MapViewModel vm)
    {
        InitializeComponent();
        BindingContext = _vm = vm;
    }

    // Sự kiện 1: Khi bấm vào Cây ghim đỏ trên bản đồ
    private async void OnPinMarkerClicked(object? sender, PinClickedEventArgs e)
    {
        if (sender is not Pin pin) return;

        if (_pinToPoi.TryGetValue(pin, out var poi))
        {
            // 1. Zoom bản đồ tới điểm đó
            Map.MoveToRegion(
                MapSpan.FromCenterAndRadius(pin.Location, Distance.FromMeters(200)));

            // 2. Chặn không cho hiện cái bong bóng mặc định cũ nữa
            e.HideInfoWindow = true;

            // 3. Báo cho ViewModel biết điểm nào đang được chọn để bật Bảng thông tin (Bottom Panel) lên
            _vm.SelectedPoi = poi;

            // 4. Vẫn đọc bài ngắn giới thiệu khi vừa bấm
            await _vm.PlayPoiAsync(poi, _vm.CurrentLanguage);
        }
    }

    // --- 2 HÀM MỚI CHO BẢNG THÔNG TIN ---
    // Khi bấm nút "Nghe chi tiết" màu xanh
    private async void OnListenDetailedClicked(object sender, EventArgs e)
    {
        if (_vm.SelectedPoi != null)
        {
            await _vm.PlayPoiDetailedAsync(_vm.SelectedPoi, _vm.CurrentLanguage);
        }
    }

    // Khi bấm nút "Đóng"
    private void OnClosePanelClicked(object sender, EventArgs e)
    {
        // Gán bằng null để bảng thông tin tự động trượt xuống/biến mất
        _vm.SelectedPoi = null;
    }
    // ------------------------------------

    protected override void OnAppearing()
    {
        base.OnAppearing();
        _ = OnAppearingAsync();
    }

    private async Task OnAppearingAsync()
    {
        if (_isTracking) return;

        // 1. Chờ ông Database nạp xong danh sách các điểm
        await _vm.LoadPoisAsync();
        // 2. Ép định vị check ngay lập tức xem mình có đang đứng trong điểm nào không
        await _vm.UpdateLocationAsync();

        _isTracking = true;

        _cts = new CancellationTokenSource();
        _timer = new PeriodicTimer(TimeSpan.FromSeconds(5));

        _ = StartTrackingAsync(_cts.Token);
    }

    protected override void OnDisappearing()
    {
        base.OnDisappearing();

        _isTracking = false;
        _poisDrawn = false;

        _cts?.Cancel();
        _cts?.Dispose();
        _cts = null;

        _timer?.Dispose();
        _timer = null;
    }

    private async Task StartTrackingAsync(CancellationToken ct)
    {
        if (_timer == null) return;

        try
        {
            while (_timer != null &&
                   await _timer.WaitForNextTickAsync(ct))
            {
                await _vm.UpdateLocationAsync();

                var location = _vm.CurrentLocation;
                if (location == null) continue;

                var center = new Location(location.Latitude, location.Longitude);

                DrawUserLocation(center);

                if (!_poisDrawn)
                {
                    DrawPois();

                    MainThread.BeginInvokeOnMainThread(() =>
                    {
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
        MainThread.BeginInvokeOnMainThread(() =>
        {
            if (_userPin == null)
            {
                _userPin = new Pin
                {
                    Label = "Bạn đang ở đây",
                    Location = location,
                    Type = PinType.Generic
                };

                Map.Pins.Add(_userPin);
            }
            else
            {
                _userPin.Location = location;
            }
        });
    }

    private void DrawPois()
    {
        MainThread.BeginInvokeOnMainThread(() =>
        {
            // 1. Xóa các điểm cũ 
            var pinsToRemove = Map.Pins.Where(p => p != _userPin).ToList();
            foreach (var p in pinsToRemove)
            {
                Map.Pins.Remove(p);
            }

            Map.MapElements.Clear();
            _pinToPoi.Clear();

            // 2. Vẽ lại các điểm mới
            foreach (var poi in _vm.Pois)
            {
                var pin = new Pin
                {
                    Label = poi.Name,
                    Address = poi.Summary, // Đã xóa chữ "(Chạm để nghe chi tiết)" vì không còn dùng bong bóng nữa
                    Location = new Location(poi.Latitude, poi.Longitude),
                    Type = PinType.Place
                };

                // Gắn 1 sự kiện duy nhất cho ghim
                pin.MarkerClicked += OnPinMarkerClicked;

                Map.Pins.Add(pin);
                _pinToPoi[pin] = poi;

                // 3. Vẽ vòng tròn bán kính
                Map.MapElements.Add(new Circle
                {
                    Center = pin.Location,
                    Radius = Distance.FromMeters(poi.Radius),
                    StrokeColor = Colors.Blue,
                    FillColor = Colors.LightBlue.WithAlpha(0.3f),
                    StrokeWidth = 2
                });
            }
        });
    }
}