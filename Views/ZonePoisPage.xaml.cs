using System.Collections.ObjectModel;
using System.Diagnostics;
using MauiApp1.ApplicationContracts.Repositories;
using MauiApp1.Models;
using MauiApp1.Services;
using Microsoft.Maui.Controls;

namespace MauiApp1.Views;

public partial class ZonePoisPage : ContentPage, IQueryAttributable
{
    private readonly IPoiQueryRepository _poiQuery;
    private readonly ApiService _apiService;
    private readonly AuthService _authService;
    private readonly MauiApp1.ApplicationContracts.Services.ILocalizationService _localization;

    private string? _zoneCode;
    private string? _zoneName;
    private string? _language;
    private readonly ObservableCollection<PoiListItem> _pois = new();

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

    public void ApplyQueryAttributes(IDictionary<string, object> query)
    {
        string? Decode(string key)
        {
            if (query.TryGetValue(key, out var value) && value != null)
            {
                var raw = value.ToString()?.Trim();
                if (!string.IsNullOrWhiteSpace(raw))
                    return Uri.UnescapeDataString(raw);
            }
            return null;
        }

        _zoneCode = Decode("zoneCode");
        _zoneName = Decode("zoneName");
        _language = Decode("lang") ?? "vi";

        Debug.WriteLine($"[ZONE-POIS] ApplyQuery zoneCode='{_zoneCode}' zoneName='{_zoneName}' lang='{_language}'");
    }

    protected override async void OnNavigatedTo(NavigatedToEventArgs args)
    {
        base.OnNavigatedTo(args);
        await LoadZonePoisAsync();
    }

    private async Task LoadZonePoisAsync()
    {
        try
        {
            MainThread.BeginInvokeOnMainThread(() =>
            {
                ErrorLabel.IsVisible = false;
                EmptyStateLabel.IsVisible = false;
                PoisCollectionView.IsVisible = true;
                LoadingIndicator.IsRunning = true;
                LoadingIndicator.IsVisible = true;
                ZoneDescriptionLabel.Text = string.Empty;
                PoiCountLabel.Text = "Loading...";
                ZoneNameLabel.Text = !string.IsNullOrWhiteSpace(_zoneName) ? _zoneName : "Zone POIs";
            });

            var zoneCode = _zoneCode?.Trim().ToUpperInvariant();
            if (string.IsNullOrEmpty(zoneCode))
            {
                Debug.WriteLine("[ZONE-POIS] Missing zoneCode from navigation query");
                MainThread.BeginInvokeOnMainThread(async () => await DisplayAlert("Error", "Zone code is missing", "OK"));
                MainThread.BeginInvokeOnMainThread(() =>
                {
                    _pois.Clear();
                    PoisCollectionView.IsVisible = false;
                    EmptyStateLabel.IsVisible = false;
                    ErrorLabel.Text = "Zone code is missing";
                    ErrorLabel.IsVisible = true;
                    PoiCountLabel.Text = "0 locations";
                });
                return;
            }

            Debug.WriteLine($"[ZONE-POIS] Loading zoneCode='{zoneCode}' lang='{_language ?? "vi"}'");

            using var response = await _apiService.GetAsync($"zones/{zoneCode}");
            var json = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                Debug.WriteLine($"[ZONE-POIS] zones/{{code}} failed status={(int)response.StatusCode} body={json}");
                MainThread.BeginInvokeOnMainThread(async () => await DisplayAlert("Error", "Unable to load zone data", "OK"));
                MainThread.BeginInvokeOnMainThread(() =>
                {
                    _pois.Clear();
                    PoisCollectionView.IsVisible = false;
                    EmptyStateLabel.IsVisible = false;
                    ErrorLabel.Text = "Unable to load zone data";
                    ErrorLabel.IsVisible = true;
                    PoiCountLabel.Text = "0 locations";
                });
                return;
            }

            var zoneData = System.Text.Json.JsonSerializer.Deserialize<ZoneAccessResponse>(
                json,
                new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            var zonePoiCodes = zoneData?.Data?.PoiCodes?
                .Where(c => !string.IsNullOrWhiteSpace(c))
                .Select(c => c.Trim().ToUpperInvariant())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList() ?? new List<string>();

            Debug.WriteLine($"[ZONE-POIS] API zonePoiCodes count={zonePoiCodes.Count}");

            await _poiQuery.InitAsync();
            var allPois = await _poiQuery.GetAllAsync();
            Debug.WriteLine($"[ZONE-POIS] Local POIs available count={allPois.Count}");

            var poisToShow = zonePoiCodes.Count > 0
                ? allPois.Where(p => zonePoiCodes.Contains(p.Code, StringComparer.OrdinalIgnoreCase)).ToList()
                : new List<Poi>();
            
            if (zonePoiCodes.Count > 0 && poisToShow.Count < zonePoiCodes.Count)
            {
                var missing = zonePoiCodes.Where(c => !allPois.Any(p => string.Equals(p.Code, c, StringComparison.OrdinalIgnoreCase))).ToList();
                Debug.WriteLine($"[ZONE-POIS] Warning: {missing.Count} POIs missing from local database: {string.Join(", ", missing)}");
            }

            Debug.WriteLine($"[ZONE-POIS] Filtered POIs count={poisToShow.Count} for zoneCode='{zoneCode}'");

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
                    AccessFrame.IsVisible = true;
                    AccessMessageLabel.Text = "Login and purchase this zone to unlock all locations";
                    PurchaseButton.Text = "Login to Purchase";
                }

                _pois.Clear();
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
                ZoneNameLabel.Text = _zoneName ?? zoneCode;
                ZoneDescriptionLabel.Text = zoneData?.Data?.Description ?? string.Empty;
                ErrorLabel.IsVisible = false;
                EmptyStateLabel.IsVisible = _pois.Count == 0;
                PoisCollectionView.IsVisible = _pois.Count > 0;
            });
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[ZONE-POIS] Load error: {ex}");
            MainThread.BeginInvokeOnMainThread(async () => await DisplayAlert("Error", "Failed to load zone POIs", "OK"));
            MainThread.BeginInvokeOnMainThread(() =>
            {
                _pois.Clear();
                PoisCollectionView.IsVisible = false;
                EmptyStateLabel.IsVisible = false;
                ErrorLabel.Text = "Failed to load zone POIs";
                ErrorLabel.IsVisible = true;
                PoiCountLabel.Text = "0 locations";
            });
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
                string errorContent = await response.Content.ReadAsStringAsync();
                string message = "Unknown error occurred";
                try
                {
                    // Try to parse friendly message from JSON
                    var errorObj = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(errorContent);
                    if (errorObj.TryGetProperty("error", out var errorProp) && errorProp.TryGetProperty("message", out var msgProp))
                    {
                        message = msgProp.GetString();
                    }
                    else if (errorObj.TryGetProperty("message", out var directMsgProp))
                    {
                        message = directMsgProp.GetString();
                    }
                }
                catch { message = errorContent; }

                await DisplayAlert("Purchase Failed", message, "OK");
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
    public string? Code { get; set; }
    public string? Name { get; set; }
    public string? Description { get; set; }
    public ZoneAccessStatus? AccessStatus { get; set; }
    public List<string>? PoiCodes { get; set; }
}

public class ZoneAccessStatus
{
    public bool HasAccess { get; set; }
    public bool RequiresPurchase { get; set; }
    public int Price { get; set; }
}
