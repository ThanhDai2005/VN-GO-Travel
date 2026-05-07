# 6. Class Diagram (Textual Pre-UML)

## 6.1 Class Grouping

## ViewModels
- `MapViewModel`: Quản lý logic bản đồ và geofencing trigger.
- `QrScannerViewModel`: Xử lý input từ camera/nhập tay.
- `PoiDetailViewModel`: Quản lý nội dung POI, trạng thái sở hữu Zone Pass, và điều khiển Audio.
- `LanguageSelectorViewModel`: Quản lý danh sách và chuyển đổi ngôn ngữ.
- `ZonePurchaseViewModel`: Quản lý logic mua Quyền truy cập khu vực (Zone Pass).

## Services
- State/Navigation:
  - `AppState`: Lưu trữ trạng thái runtime (User, Location, Owned Zones, Current POI).
  - `NavigationService`: Điều phối chuyển trang an toàn với Semaphore.
  - `DeepLinkCoordinator`: Xử lý Android Intent/URL vào app.
- POI domain:
  - `PoiHydrationService`: Kết hợp core data (SQLite) và localization (In-memory) để tạo Model hoàn chỉnh.
  - `PoiEntryCoordinator`: Nhận diện POI từ QR/DeepLink và chuẩn bị dữ liệu trước khi Navigate.
  - `PoiFocusService`: Quản lý POI đang được chọn/ngắm trên bản đồ.
  - `PoiNarrationService`: Điều khiển luồng phát Short/Long Narration.
  - `GeofenceService`: Logic kiểm tra bán kính và cooldown trigger.
  - `PoiTranslationService`: Logic dịch động và quản lý cache bản dịch.
  - `LocalizationService`: Quản lý kho nội dung đa ngôn ngữ in-memory.
  - `PoiDatabase`: Wrapper cho SQLite local (Pois, OwnedZones, TranslationCache).
- Infra/service wrappers:
  - `ApiService`: Giao tiếp với Node.js Backend.
  - `AuthService`: Quản lý JWT và thông tin User.
  - `AudioService`: Wrapper cho platform-native TTS và Audio Player.
  - `DeviceLocationService`: Lấy GPS từ thiết bị.

## Models
- Mobile:
  - `Poi`: Core geospatial data.
  - `PoiLocalization`: Textual content (Summary, NarrationShort, NarrationLong).
  - `Zone`: Thông tin khu vực/tour.
  - `UserUnlockZone`: Record quyền sở hữu khu vực.
  - `PoiTranslationCacheEntry`.
- Backend:
  - `Poi` (Mongoose model).
  - `Zone` (Mongoose model).
  - `User` (Mongoose model - Đã loại bỏ `isPremium`).
  - `UserUnlockZone` (Mongoose model - Mapping User <-> Zone).

## 6.2 Core Relationships

- `PoiDetailViewModel` phụ thuộc vào `AppState` để biết POI hiện tại đã được mua Zone Pass hay chưa.
- `PoiDetailViewModel` sử dụng `Flat Properties` để bind trực tiếp dữ liệu từ POI Model lên UI (XAML).
- `PurchaseFrame` trên UI bind với `IsOwned` property; nếu `True` -> `IsVisible = False`.

## 6.3 God Classes / Tight Coupling Areas

- `MapViewModel`: Vẫn là điểm tập trung nhiều logic (Sync, Geofence, UI Update).
- `PoiEntryCoordinator`: Phụ thuộc vào cả API, DB, và Navigation.

## 6.4 Model Mapping (MongoDB vs SQLite)
- **MongoDB**: Chứa `user_unlock_zones` để lưu vết mua hàng trọn đời.
- **SQLite**: Chứa bảng `owned_zones` được đồng bộ từ backend để kiểm tra quyền truy cập khi offline.
