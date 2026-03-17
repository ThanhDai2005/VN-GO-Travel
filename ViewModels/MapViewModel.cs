using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Globalization;
using System.Runtime.CompilerServices;
using System.Text.Json;
using Microsoft.Maui.ApplicationModel;
using Microsoft.Maui.Devices.Sensors;
using MauiApp1.Models;
using MauiApp1.Services;

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
        set
        {
            if (_currentLanguage != value)
            {
                _currentLanguage = value;
                OnPropertyChanged();
            }
        }
    }

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

    // --- PHẦN THÊM MỚI: Quản lý địa điểm đang chọn để hiện Bottom Panel ---
    private Poi? _selectedPoi;
    public Poi? SelectedPoi
    {
        get => _selectedPoi;
        set
        {
            _selectedPoi = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(IsPoiPanelVisible)); // Kích hoạt ẩn/hiện bảng
        }
    }

    // Trả về true nếu có địa điểm được chọn, false nếu không có
    public bool IsPoiPanelVisible => SelectedPoi != null;
    // --------------------------------------------------------------------

    public ObservableCollection<Poi> Pois { get; } = new ObservableCollection<Poi>();

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

        // Tạm thời set mặc định lúc khởi tạo, sẽ được tính toán lại trong LoadPoisAsync
        CurrentLanguage = "vi";
        _geofenceService.CurrentLanguage = CurrentLanguage;
    }

    public async Task UpdateLocationAsync()
    {
        var loc = await _locationService.GetCurrentLocationAsync();
        if (loc == null) return;

        CurrentLocation = loc;
        await _geofenceService.CheckLocationAsync(loc);
    }

    public void SetPois(IEnumerable<Poi> pois)
    {
        MainThread.BeginInvokeOnMainThread(() =>
        {
            Pois.Clear();
            foreach (var poi in pois)
            {
                Pois.Add(poi);
            }
        });

        _geofenceService.UpdatePois(pois.ToList());
    }

    // Vẫn giữ lại hàm này phòng hờ sau này bạn làm nút bấm đổi ngôn ngữ trên màn hình
    public void SetLanguage(string language)
    {
        CurrentLanguage = string.IsNullOrWhiteSpace(language) ? "vi" : language;
        _geofenceService.CurrentLanguage = CurrentLanguage;
    }

    // Đọc bài NGẮN (NarrationShort) khi mới chạm vào ghim hoặc đi ngang qua
    public async Task PlayPoiAsync(Poi poi, string? lang = null)
    {
        var language = string.IsNullOrWhiteSpace(lang) ? CurrentLanguage : lang;
        var text = !string.IsNullOrWhiteSpace(poi.NarrationShort) ? poi.NarrationShort : poi.Name;

        if (!string.IsNullOrWhiteSpace(text))
            await _audioService.SpeakAsync(text, language);
    }

    //  Đọc bài DÀI (NarrationLong) khi người dùng chủ động muốn nghe
    public async Task PlayPoiDetailedAsync(Poi poi, string? lang = null)
    {
        var language = string.IsNullOrWhiteSpace(lang) ? CurrentLanguage : lang;

        // Ưu tiên lấy bài dài. Nếu lỡ JSON điểm này chưa có bài dài, thì lấy tạm bài ngắn đọc đỡ
        var text = !string.IsNullOrWhiteSpace(poi.NarrationLong) ? poi.NarrationLong :
                   (!string.IsNullOrWhiteSpace(poi.NarrationShort) ? poi.NarrationShort : poi.Name);

        if (!string.IsNullOrWhiteSpace(text))
            await _audioService.SpeakAsync(text, language);
    }

    private async Task<List<Poi>> LoadPoisFromJsonAsync(string lang)
    {
        using var stream = await FileSystem.OpenAppPackageFileAsync("pois.json");
        using var reader = new StreamReader(stream);

        var json = await reader.ReadToEndAsync();

        //Dọn sạch các khoảng trắng tàng hình do copy/paste gây lỗi
        json = json.Replace("\u00A0", " ");

        var allPoisFromJson = JsonSerializer.Deserialize<List<Poi>>(json,
            new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            }) ?? new List<Poi>();

        return allPoisFromJson
            .Where(p => p.LanguageCode == lang && !string.IsNullOrWhiteSpace(p.Code))
            .ToList();
    }

    public async Task LoadPoisAsync()
    {
        await _db.InitAsync();

        // 1. Lấy ngôn ngữ tự động của máy
        var deviceLang = CultureInfo.CurrentCulture.TwoLetterISOLanguageName;
        if (string.IsNullOrWhiteSpace(deviceLang)) deviceLang = "vi";

        // 2. Thử đọc JSON theo ngôn ngữ máy
        var seedPois = await LoadPoisFromJsonAsync(deviceLang);

        // 3. FALLBACK: Nếu JSON không có ngôn ngữ này (ví dụ khách xài tiếng Pháp), lùi về tiếng Anh hoặc Việt
        if (seedPois.Count == 0)
        {
            deviceLang = "vi"; // Mặc định lùi về tiếng Việt nếu không tìm thấy
            seedPois = await LoadPoisFromJsonAsync(deviceLang);
        }

        // 4. Chốt ngôn ngữ
        CurrentLanguage = deviceLang;
        _geofenceService.CurrentLanguage = CurrentLanguage;

        // 5. Nạp vào Database
        await _db.UpsertManyAsync(seedPois);

        // 6. Lấy dữ liệu lên giao diện
        var poisFromDb = await _db.GetAllAsync(CurrentLanguage);

        MainThread.BeginInvokeOnMainThread(() =>
        {
            Pois.Clear();
            foreach (var poi in poisFromDb)
            {
                Pois.Add(poi);
            }
        });

        _geofenceService.UpdatePois(poisFromDb);
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnPropertyChanged([CallerMemberName] string name = "")
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}