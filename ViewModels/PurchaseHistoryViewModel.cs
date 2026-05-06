using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using MauiApp1.Models.Entities;
using MauiApp1.Services;

namespace MauiApp1.ViewModels;

public sealed class PurchaseHistoryViewModel : INotifyPropertyChanged
{
    private readonly AuthService _auth;
    private readonly IZoneAccessRepository _repo;
    private readonly IPoiQueryRepository _poiQuery;
    private readonly INavigationService _nav;

    public ObservableCollection<PurchaseHistoryItem> Items { get; } = new();

    public PurchaseHistoryViewModel(AuthService auth, IZoneAccessRepository repo, IPoiQueryRepository poiQuery, INavigationService nav)
    {
        _auth = auth;
        _repo = repo;
        _poiQuery = poiQuery;
        _nav = nav;
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public async Task EnsureAuthAndLoadAsync()
    {
        if (!_auth.IsAuthenticated)
        {
            await _nav.NavigateToAsync("//login").ConfigureAwait(false);
            return;
        }

        await LoadAsync().ConfigureAwait(false);
    }

    public async Task LoadAsync()
    {
        await _repo.InitializeAsync().ConfigureAwait(false);
        await _poiQuery.InitAsync().ConfigureAwait(false);
        if (string.IsNullOrWhiteSpace(_auth.UserId))
            return;

        var allPois = await _poiQuery.GetAllAsync().ConfigureAwait(false);
        var allRows = new List<PurchaseHistoryItem>();

        try
        {
            var api = Microsoft.Extensions.DependencyInjection.ServiceProviderServiceExtensions.GetRequiredService<ApiService>(App.Current.Handler.MauiContext.Services);
            using var resp = await api.GetAsync("purchase/history").ConfigureAwait(false);
            if (resp.IsSuccessStatusCode)
            {
                var content = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);
                var doc = System.Text.Json.JsonDocument.Parse(content);
                if (doc.RootElement.TryGetProperty("data", out var dataArr) && dataArr.ValueKind == System.Text.Json.JsonValueKind.Array)
                {
                    foreach (var item in dataArr.EnumerateArray())
                    {
                        var code = item.GetProperty("code").GetString() ?? "";
                        var purchasedAt = item.GetProperty("purchasedAt").GetRawText().Replace("\"", "");
                        
                        string zoneName = code;
                        int poiCount = 0;
                        if (item.TryGetProperty("metadata", out var meta))
                        {
                            if (meta.TryGetProperty("zoneName", out var zName))
                                zoneName = zName.GetString() ?? code;
                            
                            if (meta.TryGetProperty("poiCount", out var pCount))
                                poiCount = pCount.GetInt32();
                        }
                        
                        if (poiCount == 0)
                        {
                             poiCount = allPois.Count(p => string.Equals(p.ZoneCode, code, StringComparison.OrdinalIgnoreCase));
                        }

                        decimal price = 0;
                        if (item.TryGetProperty("price", out var pVal))
                        {
                            price = pVal.GetDecimal();
                        }

                        allRows.Add(new PurchaseHistoryItem
                        {
                            ZoneCode = code,
                            ZoneName = zoneName,
                            PurchasedAt = purchasedAt,
                            PoiCount = poiCount,
                            Price = price,
                            DownloadStatus = "pending" // Will be updated by downloads check
                        });
                    }
                }
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[PURCHASE-HISTORY] API Load error: {ex}");
            // Fallback to local if API fails? For now just log.
        }

        var downloads = await _repo.GetAllDownloadedAudioAsync().ConfigureAwait(false);
        foreach (var row in allRows)
        {
            row.DownloadStatus = downloads.Any(d => string.Equals(d.ZoneId, row.ZoneCode, StringComparison.OrdinalIgnoreCase)) ? "downloaded" : "pending";
        }

        await MainThread.InvokeOnMainThreadAsync(() =>
        {
            Items.Clear();
            foreach (var item in allRows.OrderByDescending(x => x.PurchasedAt))
                Items.Add(item);
        });
    }

    private void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}

public sealed class PurchaseHistoryItem
{
    public string ZoneCode { get; set; } = "";
    public string ZoneName { get; set; } = "";
    public string PurchasedAt { get; set; } = "";
    public int PoiCount { get; set; }
    public decimal Price { get; set; }
    public string DownloadStatus { get; set; } = "pending";
}
