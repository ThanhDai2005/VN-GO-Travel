# Luồng dữ liệu hiện tại

## 1) Khởi động app

1. `App` khởi tạo `AppShell`.
2. `MauiProgram` đăng ký DI cho DB, localization, map, audio, QR.
3. `MapViewModel` được dùng khi vào màn map.

## 2) Seed dữ liệu ban đầu

1. `MapViewModel.LoadPoisAsync()` gọi `PoiDatabase.InitAsync()`.
2. `LocalizationService.InitializeAsync()` đọc `Resources/Raw/pois.json`.
3. Nếu DB chưa có POI:
   - lấy danh sách core POI từ `LocalizationService.GetCorePoisForSeeding()`,
   - insert vào bảng `pois` (1 dòng cho mỗi `Code`).

## 3) Hiển thị POI trên bản đồ

1. Đọc tất cả POI lõi từ SQLite.
2. Với mỗi POI, gắn text theo ngôn ngữ hiện tại bằng `LocalizationService.GetLocalizationResult(...)`.
3. Đổ vào `MapViewModel.Pois` để vẽ pin/circle trên `MapPage`.

## 4) Luồng GPS -> geofence -> âm thanh

1. `MapPage` chạy timer 5 giây/lần.
2. `MapViewModel.UpdateLocationAsync()` lấy GPS qua `LocationService`.
3. `GeofenceService.CheckLocationAsync()`:
   - lọc POI trong bán kính,
   - chọn POI theo `Priority` rồi khoảng cách,
   - áp cooldown trigger.
4. Khi hợp lệ, gọi `AudioService.SpeakAsync(...)`.

## 5) Luồng quét QR / nhập mã

1. `QrScannerViewModel` nhận raw input.
2. `PoiEntryCoordinator` parse qua `QrResolver`.
3. Nếu parse OK:
   - kiểm tra POI có trong DB,
   - điều hướng `//map?code=...&lang=...` hoặc `/poidetail?...`.
4. `MapPage` hoặc `PoiDetailViewModel` tự hydrate text theo ngôn ngữ hiện tại.

## 6) Luồng đổi ngôn ngữ

1. Người dùng chọn ngôn ngữ.
2. `MapViewModel.ApplyLanguageSelectionAsync(...)`:
   - persist ngôn ngữ mới,
   - dừng audio hiện tại,
   - re-hydrate lại `Pois` trong bộ nhớ (không reload DB),
   - cập nhật geofence list.
3. Nếu cần, `PoiTranslationService` dịch động cho ngôn ngữ chưa có sẵn và ghi cache.

## 7) Deep link (phần đang dùng)

- Android warm intent đi qua `DeepLinkCoordinator`.
- Khi shell sẵn sàng, coordinator gọi `DeepLinkHandler`.
- `DeepLinkHandler` tái sử dụng `PoiEntryCoordinator` nên dùng chung logic với QR.
