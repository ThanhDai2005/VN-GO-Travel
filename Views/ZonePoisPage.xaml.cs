using System.Collections.ObjectModel;
using System.Diagnostics;
using MauiApp1.ApplicationContracts.Repositories;
using MauiApp1.Models;
using MauiApp1.Services;
using MauiApp1.Messages;
using CommunityToolkit.Mvvm.Messaging;
using Microsoft.Maui.Controls;
using Microsoft.Maui.ApplicationModel;
using Microsoft.Extensions.DependencyInjection;

namespace MauiApp1.Views;

public partial class ZonePoisPage : ContentPage, IQueryAttributable
{
    private readonly IPoiQueryRepository _poiQuery;
    private readonly IPoiCommandRepository _poiCommand;
    private readonly ApiService _apiService;
    private readonly AuthService _authService;
    private readonly MauiApp1.ApplicationContracts.Services.ILocalizationService _localization;
    private readonly IZoneAccessService _zoneAccessService;
    private readonly IAudioDownloadService _audioDownloadService;
    private readonly IAccessStateCoordinator _accessStateCoordinator;
    private readonly IServiceProvider _services;

    private string? _zoneCode;
    private string? _zoneName;
    private string? _language;
    private readonly ObservableCollection<PoiListItem> _pois = new();
    private static readonly SemaphoreSlim _purchaseLock = new(1, 1);

    public ZonePoisPage(
        IPoiQueryRepository poiQuery,
        IPoiCommandRepository poiCommand,
        ApiService apiService,
        AuthService authService,
        MauiApp1.ApplicationContracts.Services.ILocalizationService localization,
        IZoneAccessService zoneAccessService,
        IAudioDownloadService audioDownloadService,
        IAccessStateCoordinator accessStateCoordinator,
        IServiceProvider services)
    {
        InitializeComponent();
        _poiQuery = poiQuery;
        _poiCommand = poiCommand;
        _apiService = apiService;
        _authService = authService;
        _localization = localization;
        _zoneAccessService = zoneAccessService;
        _audioDownloadService = audioDownloadService;
        _accessStateCoordinator = accessStateCoordinator;
        _services = services;

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
                MainThread.BeginInvokeOnMainThread(async () => await DisplayAlertAsync("Error", "Zone code is missing", "OK"));
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
                MainThread.BeginInvokeOnMainThread(async () => await DisplayAlertAsync("Error", "Unable to load zone data", "OK"));
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

            // FIX: Backend now returns full POI objects in 'pois' array
            var apiPois = zoneData?.Data?.Pois ?? new List<ZonePoiDto>();
            Debug.WriteLine($"[ZONE-POIS] API returned {apiPois.Count} POIs");

            // Merge API POIs into local database
            await _poiQuery.InitAsync();
            foreach (var apiPoi in apiPois)
            {
                if (apiPoi.Location != null && !string.IsNullOrWhiteSpace(apiPoi.Code))
                {
                    var poi = new Poi
                    {
                        Id = apiPoi.Code,
                        Code = apiPoi.Code,
                        Latitude = apiPoi.Location.Lat,
                        Longitude = apiPoi.Location.Lng,
                        Radius = apiPoi.Radius > 0 ? apiPoi.Radius : 50,
                        Priority = apiPoi.Priority,
                        ZoneCode = zoneCode,
                        ZoneName = _zoneName ?? zoneCode
                    };
                    await _poiCommand.UpsertAsync(poi);

                    // Register localization
                    if (!string.IsNullOrWhiteSpace(apiPoi.Name))
                    {
                        var localization = new PoiLocalization
                        {
                            Code = apiPoi.Code,
                            LanguageCode = apiPoi.LanguageCode ?? "vi",
                            Name = apiPoi.Name,
                            Summary = apiPoi.Summary ?? "",
                            NarrationShort = apiPoi.Summary ?? "",
                            NarrationLong = apiPoi.Summary ?? ""
                        };
                        _localization.RegisterDynamicTranslation(apiPoi.Code, localization.LanguageCode, localization);
                    }
                }
            }

            var poisToShow = apiPois;
            Debug.WriteLine($"[ZONE-POIS] Displaying {poisToShow.Count} POIs for zoneCode='{zoneCode}'");

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
                foreach (var apiPoi in poisToShow)
                {
                    _pois.Add(new PoiListItem
                    {
                        Code = apiPoi.Code,
                        Name = apiPoi.Name ?? apiPoi.Code,
                        Summary = apiPoi.Summary ?? "A beautiful location",
                        Latitude = apiPoi.Location?.Lat ?? 0,
                        Longitude = apiPoi.Location?.Lng ?? 0
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
            MainThread.BeginInvokeOnMainThread(async () => await DisplayAlertAsync("Error", "Failed to load zone POIs", "OK"));
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
            var route = $"/poidetail?code={Uri.EscapeDataString(selectedPoi.Code)}&lang={Uri.EscapeDataString(_language ?? "vi")}&zoneCode={Uri.EscapeDataString(_zoneCode ?? "")}&zoneName={Uri.EscapeDataString(_zoneName ?? "")}";
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
                await NavigateToLoginSafeAsync();
                return;
            }

            var confirm = await DisplayAlertAsync(
                "Purchase Zone",
                $"Do you want to purchase '{_zoneName}' zone?",
                "Yes",
                "No");

            if (!confirm) return;

            await _purchaseLock.WaitAsync().ConfigureAwait(false);
            try
            {
                // Call purchase API
                using var response = await _apiService.PostAsJsonAsync("purchase/zone", new { zoneCode = _zoneCode });

                if (response.IsSuccessStatusCode)
                {
                    var normalizedZone = _zoneCode?.Trim().ToUpperInvariant();
                    if (!string.IsNullOrWhiteSpace(normalizedZone))
                    {
                        // Task 5.1: Atomic Sync + Cache Update
                        await _zoneAccessService.SetAccessAsync(normalizedZone, true, "ZonePoisPurchase");
                        await _zoneAccessService.SyncAsync(); 
                    }

                    await MainThread.InvokeOnMainThreadAsync(async () =>
                    {
                        await DisplayAlertAsync("Success", "Zone purchased successfully!", "OK");
                        AccessFrame.IsVisible = false;
                    });

                var modal = _services.GetRequiredService<DownloadProgressPage>();
                await Navigation.PushModalAsync(modal);
                try
                {
                    if (!string.IsNullOrWhiteSpace(normalizedZone))
                        await _audioDownloadService.DownloadZoneAudioAsync(normalizedZone);
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[ZONE-POIS] Audio download failed: {ex.Message}");
                    await MainThread.InvokeOnMainThreadAsync(async () => {
                        await DisplayAlert("Download Failed", "Could not download audio files. You can still stream them online.", "OK");
                    });
                }
                finally
                {
                    if (!modal.Skipped)
                        await Navigation.PopModalAsync();
                }

                    // Reload POIs to show them as accessible
                    await LoadZonePoisAsync();

                    // Force refresh access states in coordinator for each POI in this zone
                    foreach (var poi in _pois)
                    {
                        _ = _accessStateCoordinator.ForceRefreshAsync(poi.Code);
                    }
                }
                else
                {
                    string errorContent = await response.Content.ReadAsStringAsync();
                    string message = "Unknown error occurred";
                    try
                    {
                        var errorObj = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(errorContent);
                        if (errorObj.TryGetProperty("error", out var errorProp) && errorProp.TryGetProperty("message", out var msgProp))
                        {
                            message = msgProp.GetString() ?? "Unknown error";
                        }
                        else if (errorObj.TryGetProperty("message", out var directMsgProp))
                        {
                            message = directMsgProp.GetString() ?? "Unknown error";
                        }
                    }
                    catch { message = errorContent; }

                    await MainThread.InvokeOnMainThreadAsync(async () =>
                    {
                        await DisplayAlertAsync("Purchase Failed", message, "OK");
                    });
                }
            }
            finally
            {
                _purchaseLock.Release();
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[ZONE-POIS] Purchase error: {ex.Message}");
            await DisplayAlertAsync("Error", "Failed to purchase zone", "OK");
        }
        finally
        {
            LoadingIndicator.IsRunning = false;
            LoadingIndicator.IsVisible = false;
        }
    }

    private async Task NavigateToLoginSafeAsync()
    {
        try
        {
            await Shell.Current.GoToAsync("login");
        }
        catch
        {
            try
            {
                var loginPage = _services.GetRequiredService<LoginPage>();
                await Navigation.PushModalAsync(loginPage);
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[ZONE-POIS] Login navigation failed: {ex.Message}");
                await DisplayAlertAsync("Error", "Không thể mở trang đăng nhập.", "OK");
            }
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
    public List<ZonePoiDto>? Pois { get; set; } // FIX: Add full POI objects
}

public class ZonePoiDto
{
    public string Code { get; set; } = "";
    public string? Name { get; set; }
    public string? Summary { get; set; }
    public string? LanguageCode { get; set; }
    public PoiLocation? Location { get; set; }
    public double Radius { get; set; }
    public int Priority { get; set; }
}

public class PoiLocation
{
    public double Lat { get; set; }
    public double Lng { get; set; }
}

public class ZoneAccessStatus
{
    public bool HasAccess { get; set; }
    public bool RequiresPurchase { get; set; }
    public int Price { get; set; }
}
