# Class Diagram — Kiến trúc lớp hệ thống VN-GO Travel

```mermaid
classDiagram
    direction TB

    %% ── Views (Code-behind) ──────────────────────────────────────────────────
    class MapPage {
        -MapViewModel _vm
        -PeriodicTimer _timer
        -CancellationTokenSource _cts
        -Dictionary~Pin,Poi~ _pinToPoi
        +OnAppearing()
        -StartTrackingAsync(CancellationToken ct)
        -DrawPois()
        -DrawUserLocation(Location)
    }

    class PoiDetailPage {
        -PoiDetailViewModel _vm
        +ApplyQueryAttributes(IDictionary)
    }

    %% ── ViewModels ───────────────────────────────────────────────────────────
    class MapViewModel {
        -LocationService _locationService
        -GeofenceService _geofenceService
        -PoiDatabase _db
        -IPoiTranslationService _poiTranslations
        -AudioService _audioService
        -IPreferredLanguageService _languagePrefs
        -CurrentPoiStore _currentPoiStore
        +ObservableCollection~Poi~ Pois
        +Location CurrentLocation
        +Poi SelectedPoi
        +string CurrentLanguage
        +UpdateLocationAsync() Task
        +LoadPoisAsync(string lang) Task
        +PlayPoiAsync(Poi poi, string lang) Task
        +PlayPoiDetailedAsync(Poi poi, string lang) Task
        +StopAudio()
        +FocusOnPoiByCodeAsync(string code, string lang) Task
        +ApplyLanguageSelectionAsync(string code) Task
    }

    class PoiDetailViewModel {
        -PoiDatabase _db
        -IPoiTranslationService _poiTranslations
        -AudioService _audioService
        -MapViewModel _mapVm
        -IPreferredLanguageService _languagePrefs
        +Poi Poi
        +bool IsBusy
        +LoadPoiAsync(string code, string lang) Task
        +PlayAsync() Task
        +Stop()
        +OpenOnMapAsync() Task
    }

    %% ── Services — Location & Geofence ──────────────────────────────────────
    class LocationService {
        -bool _permissionGranted
        +GetCurrentLocationAsync() Task~Location~
    }

    class GeofenceService {
        -AudioService _audioService
        -List~Poi~ _pois
        -SemaphoreSlim _gate
        -string _currentActivePoiId
        -Dictionary~string,DateTime~ _lastTriggeredAt
        -double MIN_MOVEMENT_METERS = 5.0
        -int MIN_LOCATION_INTERVAL_MS = 1000
        -int TRIGGER_COOLDOWN_MS = 120000
        +string CurrentLanguage
        +UpdatePois(IEnumerable~Poi~ pois)
        +CheckLocationAsync(Location location) Task
        -DistanceInMeters(double,double,double,double) double
    }

    %% ── Services — Audio ─────────────────────────────────────────────────────
    class AudioService {
        -CancellationTokenSource _currentCts
        +SpeakAsync(string text, string languageCode) Task
        +Stop()
    }

    %% ── Services — Data & Translation ───────────────────────────────────────
    class PoiDatabase {
        -SQLiteAsyncConnection _db
        +InitAsync() Task
        +GetAllAsync(string langCode) Task~List~Poi~~
        +GetByCodeAsync(string code, string lang) Task~Poi~
        +GetExactByCodeAndLanguageAsync(string,string) Task~Poi~
        +UpsertAsync(Poi poi) Task
        +UpsertManyAsync(IEnumerable~Poi~) Task
        +GetTranslationCacheAsync(string,string) Task~PoiTranslationCacheEntry~
        +UpsertTranslationCacheAsync(PoiTranslationCacheEntry) Task
    }

    class IPoiTranslationService {
        <<interface>>
        +GetOrTranslateAsync(string code, string lang) Task~Poi~
    }

    class PoiTranslationService {
        -PoiDatabase _db
        -ITranslationProvider _translator
        -ConcurrentDictionary~string,SemaphoreSlim~ _locks
        +GetOrTranslateAsync(string code, string lang) Task~Poi~
        -MergeCachedTextWithSourcePoi(Poi,PoiTranslationCacheEntry,string,bool) Poi
    }

    class ITranslationProvider {
        <<interface>>
        +TranslateAsync(string text, string from, string to) Task~TranslationResult~
    }

    class GTranslateTranslationProvider {
        -GoogleTranslator _translator
        +TranslateAsync(string text, string from, string to) Task~TranslationResult~
    }

    %% ── Services — State & Language ──────────────────────────────────────────
    class CurrentPoiStore {
        -string _code
        -string _lang
        +event CurrentPoiChanged
        +SetCurrentPoi(string code, string lang)
        +GetCurrentPoi() tuple
        +Clear()
    }

    class IPreferredLanguageService {
        <<interface>>
        +SupportedCodes IReadOnlyList~string~
        +event PreferredLanguageChanged
        +GetStoredOrDefault() string
        +SetAndPersist(string code) string
    }

    class PreferredLanguageService {
        +SupportedCodes string[]
        +GetStoredOrDefault() string
        +SetAndPersist(string code) string
        +NormalizeCode(string code) string
    }

    %% ── Models ───────────────────────────────────────────────────────────────
    class Poi {
        +string Id
        +string Code
        +string LanguageCode
        +string Name
        +string Summary
        +string NarrationShort
        +string NarrationLong
        +double Latitude
        +double Longitude
        +double Radius
        +int Priority
        +bool IsAutoTranslated
    }

    class PoiTranslationCacheEntry {
        +string Key
        +string Code
        +string LanguageCode
        +string Name
        +string Summary
        +string NarrationShort
        +string NarrationLong
        +bool IsAutoGenerated
        +DateTime CreatedAt
        +MakeKey(string code, string lang) string
    }

    class TranslationResult {
        +string Text
        +bool Succeeded
    }

    %% ── Relationships ────────────────────────────────────────────────────────
    MapPage --> MapViewModel : binds BindingContext
    MapPage ..> GeofenceService : gián tiếp qua VM
    PoiDetailPage --> PoiDetailViewModel : binds BindingContext

    MapViewModel --> LocationService : GetCurrentLocationAsync()
    MapViewModel --> GeofenceService : CheckLocationAsync() + UpdatePois()
    MapViewModel --> PoiDatabase : LoadPoisAsync / FocusOnPoiByCode
    MapViewModel --> IPoiTranslationService : GetOrTranslateAsync()
    MapViewModel --> AudioService : PlayPoiAsync / StopAudio
    MapViewModel --> IPreferredLanguageService : GetStoredOrDefault / SetAndPersist
    MapViewModel --> CurrentPoiStore : subscribe CurrentPoiChanged

    PoiDetailViewModel --> PoiDatabase : InitAsync
    PoiDetailViewModel --> IPoiTranslationService : GetOrTranslateAsync()
    PoiDetailViewModel --> AudioService : SpeakAsync / Stop
    PoiDetailViewModel --> MapViewModel : RequestFocusOnPoiCode
    PoiDetailViewModel --> IPreferredLanguageService : GetStoredOrDefault

    GeofenceService --> AudioService : SpeakAsync(NarrationShort, lang)
    GeofenceService "1" o-- "many" Poi : in-memory _pois list

    IPoiTranslationService <|.. PoiTranslationService : implements
    PoiTranslationService --> PoiDatabase : DB read/write
    PoiTranslationService --> ITranslationProvider : translate segments

    ITranslationProvider <|.. GTranslateTranslationProvider : implements
    GTranslateTranslationProvider ..> TranslationResult : returns

    IPreferredLanguageService <|.. PreferredLanguageService : implements

    PoiDatabase ..> Poi : CRUD (SQLite table: pois)
    PoiDatabase ..> PoiTranslationCacheEntry : CRUD (SQLite table: poi_translation_cache)
```

## Giải thích kiến trúc lớp

Hệ thống tuân theo mô hình **MVVM (Model-View-ViewModel)** kết hợp **Service Layer** và **Dependency Injection** (đăng ký Singleton/Transient trong `MauiProgram.cs`).

| Tầng | Lớp chính | Trách nhiệm |
|------|-----------|-------------|
| **View** | `MapPage`, `PoiDetailPage` | Hiển thị UI, điều khiển `PeriodicTimer`, vẽ bản đồ |
| **ViewModel** | `MapViewModel`, `PoiDetailViewModel` | Điều phối logic nghiệp vụ, quản lý trạng thái UI (`INotifyPropertyChanged`) |
| **Services** | `LocationService`, `GeofenceService`, `AudioService` | Xử lý GPS, phát hiện vùng địa lý, phát âm thanh |
| **Data** | `PoiDatabase`, `PoiTranslationService` | Truy vấn SQLite, dịch thuật đa ngôn ngữ với cache |
| **Models** | `Poi`, `PoiTranslationCacheEntry` | Entity ánh xạ trực tiếp vào bảng SQLite |

**Điểm kiến trúc đáng chú ý:**
- `GeofenceService` hoạt động hoàn toàn **in-memory** — không tự truy vấn DB. Danh sách POI được nạp trước bởi `MapViewModel.LoadPoisAsync()` qua `UpdatePois()`.
- `CurrentPoiStore` là **shared state bus** (Singleton), giúp `MapViewModel` và `PoiDetailViewModel` đồng bộ trạng thái chọn POI mà không cần coupling trực tiếp.
- `PoiTranslationService` sử dụng `ConcurrentDictionary<string, SemaphoreSlim>` để **per-key locking**, tránh race condition khi nhiều màn hình cùng yêu cầu dịch cùng một POI.
- `AudioService` triển khai **preemptive cancellation** — mỗi cuộc gọi `SpeakAsync()` hủy token hiện tại trước khi bắt đầu phát mới.
