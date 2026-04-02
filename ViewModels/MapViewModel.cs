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
            }
        }
    }

    public bool IsVietnamese => CurrentLanguage == "vi";
    public bool IsEnglish => CurrentLanguage == "en";

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

        if (normalized != "vi" && normalized != "en")
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

        var targetLang = string.IsNullOrWhiteSpace(preferredLanguage)
            ? CultureInfo.CurrentCulture.TwoLetterISOLanguageName
            : preferredLanguage.Trim().ToLowerInvariant();

        if (targetLang != "vi" && targetLang != "en")
            targetLang = "vi";

        var tLoadSeedStart = sw.ElapsedMilliseconds;
        var allSeedPois = await LoadAllPoisFromJsonAsync();
        var tLoadSeedEnd = sw.ElapsedMilliseconds;

        var tUpsertStart = sw.ElapsedMilliseconds;
        await _db.UpsertManyAsync(allSeedPois);
        var tUpsertEnd = sw.ElapsedMilliseconds;

        var tGetStart = sw.ElapsedMilliseconds;
        var poisFromDb = await _db.GetAllAsync(targetLang);
        var tGetEnd = sw.ElapsedMilliseconds;

        if (poisFromDb.Count == 0 && targetLang != "vi")
        {
            targetLang = "vi";
            poisFromDb = await _db.GetAllAsync(targetLang);
        }

        CurrentLanguage = targetLang;
        _geofenceService.CurrentLanguage = CurrentLanguage;

        await RefreshPoisCollectionAsync(poisFromDb);

        _geofenceService.UpdatePois(poisFromDb);
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnPropertyChanged([CallerMemberName] string name = "")
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}