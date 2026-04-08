# Sequence Diagram — GPS Location Tracking to Audio Narration

```mermaid
sequenceDiagram
    actor User as Người dùng
    participant MP as MapPage (View)
    participant VM as MapViewModel
    participant LS as LocationService
    participant DB as PoiDatabase
    participant GS as GeofenceService
    participant AS as AudioService
    participant TTS as TextToSpeech.Default (MAUI)

    %% ── Startup: Load POIs into memory ──────────────────────────────────────
    Note over MP,DB: OnAppearing() — Khởi động, tải dữ liệu

    MP->>VM: LoadPoisAsync(preferredLanguage)
    VM->>DB: InitAsync()
    DB-->>VM: Tables ready (pois, poi_translation_cache)
    VM->>DB: UpsertManyAsync(allSeedPois from pois.json)
    VM->>DB: GetAllAsync(targetLang)
    DB-->>VM: List<Poi>
    VM->>GS: UpdatePois(List<Poi>)
    Note over GS: Lưu danh sách POI vào bộ nhớ (_pois)<br/>Xóa _currentActivePoiId và cooldown history
    VM-->>MP: Pois collection updated → DrawPois()

    %% ── Periodic Tracking Loop ───────────────────────────────────────────────
    Note over MP,AS: StartTrackingAsync() — PeriodicTimer mỗi 5 giây

    loop Mỗi 5 giây (PeriodicTimer)
        MP->>VM: UpdateLocationAsync()

        %% Location fetch + permission
        VM->>LS: GetCurrentLocationAsync()
        alt Chưa được cấp quyền vị trí
            LS->>LS: Permissions.RequestAsync<LocationWhenInUse>()
            LS-->>VM: return null
            Note over VM: Early exit, bỏ qua vòng lặp
        else Đã có quyền
            LS->>LS: Geolocation.GetLocationAsync(High accuracy, 10s timeout)
            LS-->>VM: Location {Latitude, Longitude}
        end

        VM->>VM: CurrentLocation = location

        %% Geofence check (in GeofenceService)
        VM->>GS: CheckLocationAsync(location)

        Note over GS: 1. Lọc nếu elapsed < 1000ms hoặc di chuyển < 5m (jitter guard)
        Note over GS: 2. Acquire SemaphoreSlim (gate) — ngăn xử lý đồng thời

        GS->>GS: Compute DistanceInMeters (Haversine) cho từng Poi trong _pois
        GS->>GS: Lọc: distance <= Poi.Radius
        GS->>GS: Sắp xếp: Priority DESC, Distance ASC

        alt Không có POI nào trong vùng geofence
            GS->>GS: _currentActivePoiId = null
        else Có POI hợp lệ (best candidate)
            alt POI đang active (đã phát gần đây)
                GS->>GS: Bỏ qua (suppress — "already active")
            else POI mới hoặc cooldown đã hết (>= 2 phút)
                GS->>GS: _currentActivePoiId = poi.Id
                GS->>GS: _lastTriggeredAt[poi.Id] = DateTime.UtcNow
                GS->>AS: SpeakAsync(poi.NarrationShort ?? poi.Name, CurrentLanguage)

                Note over AS: Hủy CancellationTokenSource hiện tại (dừng âm thanh cũ)
                AS->>AS: _currentCts.Cancel() và tạo CancellationTokenSource mới
                AS->>TTS: GetLocalesAsync() → tìm locale khớp ngôn ngữ
                AS->>TTS: SpeakAsync(text, SpeechOptions{Pitch=1, Volume=1}, cts.Token)
                TTS-->>User: 🔊 Phát âm thanh thuyết minh qua loa thiết bị
            end
        end

        GS-->>VM: (awaitable) hoàn thành CheckLocationAsync
        VM-->>MP: CurrentLocation updated

        %% UI proximity check in MapPage (parallel responsibility)
        Note over MP: MapPage cũng tự tính proximity để cập nhật UI
        MP->>MP: Tìm POI gần nhất trong vm.Pois (Location.CalculateDistance)
        
        alt Có POI mới trong tầm (nearest.Poi.Id != _lastAutoPoiId)
            MP->>MP: _vm.SelectedPoi = nearest.Poi → hiển thị BottomPanel
            MP->>MP: Map.MoveToRegion(poi location, 220m)
            MP->>VM: PlayPoiAsync(poi, CurrentLanguage)
            VM->>AS: SpeakAsync(NarrationShort ?? Name, language)
        else Rời khỏi tất cả POI
            MP->>MP: SelectedPoi = null → ẩn BottomPanel
            MP->>VM: StopAudio()
            VM->>AS: Stop() → _currentCts.Cancel()
        end
    end
```

## Giải thích kiến trúc

Luồng hệ thống bắt đầu bằng **`MapPage.OnAppearing()`**: trang gọi `MapViewModel.LoadPoisAsync()` để tải toàn bộ danh sách điểm đến (POI) từ file `pois.json`, upsert vào SQLite, sau đó nạp danh sách vào bộ nhớ của `GeofenceService` thông qua `UpdatePois()`. Đây là bước then chốt — `GeofenceService` **không tự truy vấn DB** mà hoạt động hoàn toàn trên bộ nhớ đệm in-memory.

Vòng lặp theo dõi vị trí được khởi động bởi một **`PeriodicTimer` (5 giây)** trong `MapPage`, không phải `DispatcherTimer`. Mỗi tick, `MapPage` gọi `MapViewModel.UpdateLocationAsync()` → `LocationService.GetCurrentLocationAsync()`. `LocationService` kiểm tra quyền GPS inline trong cùng phương thức này (không có `CheckPermissionAsync()` riêng biệt) và gọi `Geolocation.GetLocationAsync()` với độ chính xác cao, timeout 10 giây.

Sau khi có tọa độ, hệ thống xử lý **song song ở hai tầng**:
1. **`GeofenceService`** — bảo vệ chống nhiễu GPS (jitter guard: di chuyển < 5m hoặc interval < 1000ms bị bỏ qua), dùng thuật toán **Haversine** để đo khoảng cách, lọc theo `Radius`, sắp xếp theo `Priority`, và áp dụng **cooldown 2 phút** mỗi POI để tránh phát lại liên tục.
2. **`MapPage`** — tự tính proximity để cập nhật UI (BottomPanel, map center, pin selection).

`AudioService` triển khai cơ chế **preemptive cancellation**: mỗi lần `SpeakAsync()` được gọi, token hiện tại bị hủy ngay lập tức trước khi bắt đầu phát âm mới, đảm bảo không bao giờ có hai luồng TTS song song. Toàn bộ pipeline sử dụng `async/await` và được đăng ký dưới dạng **Singleton** trong DI container của MAUI.
