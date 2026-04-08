using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Globalization;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Diagnostics;
using Microsoft.Maui.ApplicationModel;
using Microsoft.Maui.Devices.Sensors;
using MauiApp1.Models;
using MauiApp1.Services;
using Microsoft.Maui.Controls;
using System.Windows.Input;

namespace MauiApp1.ViewModels;

public class MapViewModel : INotifyPropertyChanged
{
    private readonly LocationService _locationService;
    private readonly GeofenceService _geofenceService;
    private readonly PoiDatabase _db;
    private readonly AudioService _audioService;

    private string _currentLanguage = "vi";
    public string CurrentLanguage
    {
        get => _currentLanguage;
        private set
        {
            if (_currentLanguage != value)
            {
                _currentLanguage = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(IsVietnamese));
                OnPropertyChanged(nameof(IsEnglish));
                OnPropertyChanged(nameof(MapTitle));
                OnPropertyChanged(nameof(MapSubtitle));
                OnPropertyChanged(nameof(ListenDetailedButtonText));
                OnPropertyChanged(nameof(StopButtonText));
                OnPropertyChanged(nameof(UserLocationText));
            }
        }
    }

    public bool IsVietnamese => CurrentLanguage == "vi";
    public bool IsEnglish => CurrentLanguage == "en";
    public bool IsChinese => CurrentLanguage == "zh";
    public bool IsJapanese => CurrentLanguage == "ja";

    public string MapTitle => CurrentLanguage switch
    {
        "vi" => "Bản đồ Việt Nam",
        "en" => "Map of Vietnam",
        "zh" => "越南地图",
        "ja" => "ベトナム地図",
        _ => "Bản đồ Việt Nam"
    };

    public string MapSubtitle => CurrentLanguage switch
    {
        "vi" => "Khám phá bằng vị trí và âm thanh",
        "en" => "Explore with your location and audio",
        "zh" => "通过您的位置与音频探索",
        "ja" => "位置と音声で探索",
        _ => "Khám phá bằng vị trí và âm thanh"
    };

    public string ListenDetailedButtonText => CurrentLanguage switch
    {
        "vi" => "🔊 Nghe chi tiết",
        "en" => "🔊 Listen details",
        "zh" => "🔊 详细收听",
        "ja" => "🔊 詳細を聞く",
        _ => "🔊 Nghe chi tiết"
    };

    public string StopButtonText => CurrentLanguage switch
    {
        "vi" => "⏹ Dừng",
        "en" => "⏹ Stop",
        "zh" => "⏹ 停止",
        "ja" => "⏹ 停止",
        _ => "⏹ Dừng"
    };

    public string UserLocationText => CurrentLanguage switch
    {
        "vi" => "Bạn đang ở đây",
        "en" => "You are here",
        "zh" => "您在这里",
        "ja" => "ここにいます",
        _ => "Bạn đang ở đây"
    };

    private Location? _currentLocation;
    public Location? CurrentLocation
    {
        get => _currentLocation;
        private set
        {
            _currentLocation = value;
            OnPropertyChanged();
        }
    }

    private Poi? _selectedPoi;
    public Poi? SelectedPoi
    {
        get => _selectedPoi;
        set
        {
            if (_selectedPoi != value)
            {
                _selectedPoi = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(IsPoiPanelVisible));
            }
        }
    }

    public bool IsPoiPanelVisible => SelectedPoi != null;

    public ObservableCollection<Poi> Pois { get; } = new();
    private string? _pendingFocusPoiCode;
    private string? _pendingFocusPoiLang;

    // New command to open QR scanner page (Phase-1A manual paste scanner)
    public ICommand OpenQrCommand { get; }

    public MapViewModel(
        LocationService locationService,
        GeofenceService geofenceService,
        PoiDatabase db,
        AudioService audioService)
    {
        _locationService = locationService;
        _geofenceService = geofenceService;
        _db = db;
        _audioService = audioService;

        CurrentLanguage = "vi";
        _geofenceService.CurrentLanguage = CurrentLanguage;

        OpenQrCommand = new Command(async () =>
        {
            // Navigate to the registered qrscan route
            await Shell.Current.GoToAsync("qrscan");
        });
    }

    public async Task FocusOnPoiByCodeAsync(string code, string? lang = null)
    {
        if (string.IsNullOrWhiteSpace(code))
            return;

        await _db.InitAsync();

        var preferred = string.IsNullOrWhiteSpace(lang) ? CurrentLanguage : lang.Trim().ToLowerInvariant();

        var poi = await _db.GetByCodeAsync(code.Trim(), preferred);
        if (poi == null)
            return;

        SelectedPoi = poi;
    }

    public void RequestFocusOnPoiCode(string code, string? lang = null)
    {
        if (string.IsNullOrWhiteSpace(code))
            return;

        _pendingFocusPoiCode = code.Trim();
        _pendingFocusPoiLang = string.IsNullOrWhiteSpace(lang) ? null : lang.Trim().ToLowerInvariant();
        Debug.WriteLine($"[Map-VM] Pending focus requested code='{_pendingFocusPoiCode}' lang='{_pendingFocusPoiLang}'");
    }

    public (string? code, string? lang) ConsumePendingFocusRequest()
    {
        var code = _pendingFocusPoiCode;
        var lang = _pendingFocusPoiLang;
        _pendingFocusPoiCode = null;
        _pendingFocusPoiLang = null;
        return (code, lang);
    }

    public async Task UpdateLocationAsync()
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var tGetStart = sw.ElapsedMilliseconds;
        var loc = await _locationService.GetCurrentLocationAsync();
        var tGetEnd = sw.ElapsedMilliseconds;
        if (loc == null) 
        {
            Debug.WriteLine($"[MAP-TIME] UpdateLocationAsync: location null getTime={tGetEnd - tGetStart} ms");
            return;
        }

        CurrentLocation = loc;

        var tGeoStart = sw.ElapsedMilliseconds;
        await _geofenceService.CheckLocationAsync(loc);
        var tGeoEnd = sw.ElapsedMilliseconds;

        Debug.WriteLine($"[MAP-TIME] UpdateLocationAsync timings ms: get={tGetEnd - tGetStart} geofence={tGeoEnd - tGeoStart}");
    }

    public void SetLanguage(string language)
    {
        var normalized = string.IsNullOrWhiteSpace(language)
            ? "vi"
            : language.Trim().ToLowerInvariant();

        if (normalized != "vi" && normalized != "en" && normalized != "zh" && normalized != "ja")
            normalized = "vi";

        CurrentLanguage = normalized;
        _geofenceService.CurrentLanguage = CurrentLanguage;
    }

    public async Task PlayPoiAsync(Poi poi, string? lang = null)
    {
        var language = string.IsNullOrWhiteSpace(lang) ? CurrentLanguage : lang.Trim().ToLowerInvariant();

        var text = !string.IsNullOrWhiteSpace(poi.NarrationShort)
            ? poi.NarrationShort
            : poi.Name;

        if (!string.IsNullOrWhiteSpace(text))
            await _audioService.SpeakAsync(text, language);
    }

    public async Task PlayPoiDetailedAsync(Poi poi, string? lang = null)
    {
        var language = string.IsNullOrWhiteSpace(lang) ? CurrentLanguage : lang.Trim().ToLowerInvariant();

        var text = !string.IsNullOrWhiteSpace(poi.NarrationLong)
            ? poi.NarrationLong
            : (!string.IsNullOrWhiteSpace(poi.NarrationShort) ? poi.NarrationShort : poi.Name);

        if (!string.IsNullOrWhiteSpace(text))
            await _audioService.SpeakAsync(text, language);
    }

    public void StopAudio()
    {
        _audioService.Stop();
    }

    private async Task<List<Poi>> LoadAllPoisFromJsonAsync()
    {
        using var stream = await FileSystem.OpenAppPackageFileAsync("pois.json");
        using var reader = new StreamReader(stream);

        var json = await reader.ReadToEndAsync();
        json = json.Replace("\u00A0", " ");

        var allPois = JsonSerializer.Deserialize<List<Poi>>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        }) ?? new List<Poi>();

        return allPois
            .Where(p =>
                !string.IsNullOrWhiteSpace(p.Code) &&
                !string.IsNullOrWhiteSpace(p.LanguageCode))
            .Select(p =>
            {
                p.LanguageCode = p.LanguageCode.Trim().ToLowerInvariant();
                p.Id = $"{p.Code.Trim()}_{p.LanguageCode}";
                p.Code = p.Code.Trim();
                p.Name ??= "";
                p.Summary ??= "";
                p.NarrationShort ??= "";
                p.NarrationLong ??= "";
                // Keep content complete even if JSON left fields empty.
                // This prevents zh/ja entries with empty NarrationLong from degrading UX/TTS.
                if (string.IsNullOrWhiteSpace(p.NarrationShort))
                    p.NarrationShort = !string.IsNullOrWhiteSpace(p.Summary) ? p.Summary : p.Name;
                if (string.IsNullOrWhiteSpace(p.NarrationLong))
                    p.NarrationLong = p.NarrationShort;
                if (p.Radius <= 0) p.Radius = 50;
                return p;
            })
            .ToList();
    }

    private async Task RefreshPoisCollectionAsync(List<Poi> items)
    {
        await MainThread.InvokeOnMainThreadAsync(() =>
        {
            Pois.Clear();
            foreach (var poi in items)
                Pois.Add(poi);
        });
    }

    public async Task LoadPoisAsync(string? preferredLanguage = null)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        Debug.WriteLine($"[MAP-TIME] LoadPoisAsync START");

        var tInitStart = sw.ElapsedMilliseconds;
        await _db.InitAsync();
        var tInitEnd = sw.ElapsedMilliseconds;

        var uiLang = string.IsNullOrWhiteSpace(preferredLanguage)
            ? CurrentLanguage
            : preferredLanguage.Trim().ToLowerInvariant();

        if (uiLang != "vi" && uiLang != "en" && uiLang != "zh" && uiLang != "ja")
            uiLang = "vi";

        // POI data might not exist for all UI languages. Keep UI language, but fallback data language.
        var dataLang = uiLang;

        var tLoadSeedStart = sw.ElapsedMilliseconds;
        var allSeedPois = await LoadAllPoisFromJsonAsync();
        var tLoadSeedEnd = sw.ElapsedMilliseconds;

        var tUpsertStart = sw.ElapsedMilliseconds;
        await _db.UpsertManyAsync(allSeedPois);
        var tUpsertEnd = sw.ElapsedMilliseconds;

        var tGetStart = sw.ElapsedMilliseconds;
        var poisFromDb = await _db.GetAllAsync(dataLang);
        var tGetEnd = sw.ElapsedMilliseconds;

        if (poisFromDb.Count == 0 && dataLang != "vi")
        {
            dataLang = "vi";
            poisFromDb = await _db.GetAllAsync(dataLang);
        }

        _geofenceService.CurrentLanguage = CurrentLanguage;

        await RefreshPoisCollectionAsync(poisFromDb);

        _geofenceService.UpdatePois(poisFromDb);
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnPropertyChanged([CallerMemberName] string name = "")
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}