using System.Collections.ObjectModel;
using System.Diagnostics;
using MauiApp1.ApplicationContracts.Repositories;
using MauiApp1.Models;
using MauiApp1.Services;
using Microsoft.Maui.Controls;

namespace MauiApp1.Views;

public partial class ZonePoisPage : ContentPage
{
    private readonly IPoiQueryRepository _poiQuery;
    private readonly ApiService _apiService;
    private readonly AuthService _authService;
    private readonly MauiApp1.ApplicationContracts.Services.ILocalizationService _localization;

    private string? _zoneCode;
    private string? _zoneName;
    private string? _language;
    private ObservableCollection<PoiListItem> _pois = new();

    public ZonePoisPage(
        IPoiQueryRepository poiQuery,
        ApiService apiService,
        AuthService authService,
        MauiApp1.ApplicationContracts.Services.ILocalizationService localization)
    {
        InitializeComponent();
        _poiQuery = poiQuery;
        _apiService = apiService;
        _authService = authService;
        _localization = localization;

        PoisCollectionView.ItemsSource = _pois;
    }

    protected override async void OnNavigatedTo(NavigatedToEventArgs args)
    {
        base.OnNavigatedTo(args);

        // Parse query parameters
        if (Uri.TryCreate(Navigation.NavigationStack.LastOrDefault()?.GetType().Name ?? "", UriKind.Relative, out var uri))
        {
            var query = System.Web.HttpUtility.ParseQueryString(uri.Query);
            _zoneCode = query["zoneCode"];
            _zoneName = query["zoneName"];
            _language = query["lang"] ?? "vi";
        }

        await LoadZonePoisAsync();
    }

    private async Task LoadZonePoisAsync()
    {
        try
        {
            MainThread.BeginInvokeOnMainThread(() =>
            {
                LoadingIndicator.IsRunning = true;
                LoadingIndicator.IsVisible = true;
                if (!string.IsNullOrEmpty(_zoneName))
                {
                    ZoneNameLabel.Text = _zoneName;
                }
            });

            if (string.IsNullOrEmpty(_zoneCode))
            {
                MainThread.BeginInvokeOnMainThread(async () => await DisplayAlert("Error", "Zone code is missing", "OK"));
                return;
            }

            // Gọi trực tiếp API get zone info + pois (rất nhanh vì có backend)
            // Lấy POIs của zone thay vì query toàn bộ local DB
            using var response = await _apiService.GetAsync($"zones/{_zoneCode}");
            if (response.IsSuccessStatusCode)
            {
                var json = await response.Content.ReadAsStringAsync();
                var zoneData = System.Text.Json.JsonSerializer.Deserialize<ZoneAccessResponse>(json, new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                // Lấy chi tiết các POIs của Zone nếu user đã có quyền (từ backend hoặc từ QR scan token)
                // Tuy nhiên do chưa gọi API lấy danh sách POIs chuẩn, ta gọi API để query các POI của Zone đó
                // Vì endpoint zones/:code trên BE có trả về poiCodes

                // Mở local DB để lấy data hiển thị thay vì bắt user download full
                await _poiQuery.InitAsync();
                var allPois = await _poiQuery.GetAllAsync();

                MainThread.BeginInvokeOnMainThread(() =>
                {
                    if (zoneData?.Data?.AccessStatus != null)
                    {
                        if (zoneData.Data.AccessStatus.HasAccess)
                        {
                            AccessFrame.IsVisible = false;
                        }
                        else
                        {
                            AccessFrame.IsVisible = true;
                            var price = zoneData.Data.AccessStatus.Price;
                            AccessMessageLabel.Text = $"Purchase this zone for {price} credits to unlock all locations";
                            PurchaseButton.Text = $"Purchase for {price} credits";
                        }
                    }
                    else
                    {
                        // Chưa đăng nhập
                        AccessFrame.IsVisible = true;
                        AccessMessageLabel.Text = "Login and purchase this zone to unlock all locations";
                        PurchaseButton.Text = "Login to Purchase";
                    }

                    _pois.Clear();

                    // Lọc những POIs thuộc Zone này dựa trên list poiCodes trả về từ BE
                    var zonePoiCodes = zoneData?.Data?.PoiCodes ?? new List<string>();

                    // Nếu BE chưa trả về PoiCodes ở endpoint getZone thì hiển thị tạm tất cả để tránh màn hình trống
                    var poisToShow = zonePoiCodes.Count > 0
                        ? allPois.Where(p => zonePoiCodes.Contains(p.Code, StringComparer.OrdinalIgnoreCase)).ToList()
                        : allPois;

                    foreach (var poi in poisToShow)
                    {
                        var localization = _localization.GetLocalization(poi.Code, _language ?? "vi");

                        _pois.Add(new PoiListItem
                        {
                            Code = poi.Code,
                            Name = localization?.Name ?? poi.Code,
                            Summary = localization?.Summary ?? "A beautiful location",
                            Latitude = poi.Latitude,
                            Longitude = poi.Longitude
                        });
                    }
                    PoiCountLabel.Text = $"{_pois.Count} locations";
                    ZoneNameLabel.Text = _zoneName ?? _zoneCode;
                });
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[ZONE-POIS] Load error: {ex.Message}");
        }
        finally
        {
            MainThread.BeginInvokeOnMainThread(() =>
            {
                LoadingIndicator.IsRunning = false;
                LoadingIndicator.IsVisible = false;
            });
        }
    }

    private async Task CheckAccessStatusAsync()
    {
        // Hàm này đã gộp vào LoadZonePoisAsync để tránh gọi 2 lần
    }

    private async void OnPoiSelected(object sender, SelectionChangedEventArgs e)
    {
        if (e.CurrentSelection.FirstOrDefault() is PoiListItem selectedPoi)
        {
            // Navigate to POI detail
            var route = $"/poidetail?code={Uri.EscapeDataString(selectedPoi.Code)}&lang={Uri.EscapeDataString(_language ?? "vi")}";
            await Shell.Current.GoToAsync(route);

            // Deselect
            PoisCollectionView.SelectedItem = null;
        }
    }

    private async void OnPurchaseClicked(object sender, EventArgs e)
    {
        try
        {
            if (!_authService.IsAuthenticated)
            {
                // Navigate to login
                await Shell.Current.GoToAsync("//login");
                return;
            }

            var confirm = await DisplayAlert(
                "Purchase Zone",
                $"Do you want to purchase '{_zoneName}' zone?",
                "Yes",
                "No");

            if (!confirm) return;

            LoadingIndicator.IsRunning = true;
            LoadingIndicator.IsVisible = true;

            // Call purchase API
            using var response = await _apiService.PostAsJsonAsync("purchase/zone", new { zoneCode = _zoneCode });

            if (response.IsSuccessStatusCode)
            {
                await DisplayAlert("Success", "Zone purchased successfully!", "OK");
                AccessFrame.IsVisible = false;
            }
            else
            {
                var error = await response.Content.ReadAsStringAsync();
                await DisplayAlert("Error", $"Purchase failed: {error}", "OK");
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[ZONE-POIS] Purchase error: {ex.Message}");
            await DisplayAlert("Error", "Failed to purchase zone", "OK");
        }
        finally
        {
            LoadingIndicator.IsRunning = false;
            LoadingIndicator.IsVisible = false;
        }
    }
}

public class PoiListItem
{
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string Summary { get; set; } = "";
    public double Latitude { get; set; }
    public double Longitude { get; set; }
}

public class ZoneAccessResponse
{
    public bool Success { get; set; }
    public ZoneAccessData? Data { get; set; }
}

public class ZoneAccessData
{
    public ZoneAccessStatus? AccessStatus { get; set; }
    public List<string>? PoiCodes { get; set; }
}

public class ZoneAccessStatus
{
    public bool HasAccess { get; set; }
    public bool RequiresPurchase { get; set; }
    public int Price { get; set; }
}
