# VN GO Travel (MVP hiện tại)

Ứng dụng du lịch học tập bằng .NET MAUI, tập trung vào trải nghiệm bản đồ + thuyết minh tại điểm đến (POI) theo vị trí GPS và QR.

Tài liệu này mô tả **đúng hiện trạng code đang chạy**, không mô tả kiến trúc lý tưởng.

## 1) Ứng dụng đang làm được gì

- Hiển thị danh sách POI trên bản đồ.
- Lấy vị trí hiện tại (GPS), kiểm tra geofence và tự phát thuyết minh ngắn khi vào vùng POI.
- Cho phép chạm pin để nghe thuyết minh, xem chi tiết POI, nghe bản thuyết minh dài.
- Hỗ trợ quét QR để mở POI (map-first hoặc detail tùy luồng).
- Lưu dữ liệu lõi POI cục bộ bằng SQLite để chạy offline.
- Hỗ trợ ngôn ngữ: `vi`, `en`, `ja`, `ko`, `fr`, `zh` (mức độ hoàn thiện không đồng đều).

## 2) Kiến trúc thực tế (MVP)

- UI: `Views/*` (Map, QR Scanner, POI Detail, Explore, About, Language Selector).
- Logic hiển thị: `ViewModels/*` (đặc biệt `MapViewModel`, `QrScannerViewModel`, `PoiDetailViewModel`).
- Dịch vụ chính:
  - `PoiDatabase`: SQLite local (`pois.db`).
  - `LocalizationService`: nạp text POI từ `Resources/Raw/pois.json` vào bộ nhớ.
  - `LocationService` + `GeofenceService` + `AudioService`: định vị, geofence, TTS.
  - `PoiTranslationService`: dịch động khi thiếu ngôn ngữ và có cache DB.
  - `PoiEntryCoordinator` + `QrResolver`: chuẩn hóa dữ liệu QR/deep link và điều hướng.

## 3) Dòng dữ liệu hiện tại

1. Lần đầu mở app, `LocalizationService` đọc `pois.json`.
2. Nếu SQLite trống, app seed dữ liệu POI lõi (tọa độ/radius/priority, 1 dòng cho mỗi code).
3. Khi hiển thị UI, `MapViewModel` gắn phần text bản địa hóa theo ngôn ngữ đang chọn từ `LocalizationService`.
4. Geofence dùng tập POI đang active để xác định vùng và gọi TTS.
5. QR/deep link đi qua `QrResolver` + `PoiEntryCoordinator`, sau đó điều hướng đến map/detail.

## 4) Quyết định kỹ thuật và trade-off

- Chọn SQLite local để app hoạt động ổn định khi offline.
- Tách dữ liệu lõi POI (DB) và text bản địa hóa (memory lookup từ JSON) để giảm query phức tạp trong MVP.
- Dịch động chỉ là lớp bổ sung: ưu tiên `vi`, fallback khi thiếu dữ liệu.
- Dùng nhiều log `Debug.WriteLine` để theo dõi nhanh trong giai đoạn hoàn thiện MVP.

## 5) Giới hạn hiện tại (quan trọng)

- Dữ liệu gốc hiện có trong `pois.json` chủ yếu là tiếng Việt; các ngôn ngữ khác phụ thuộc fallback/dịch động.
- Chưa có cơ chế đồng bộ server chính thức cho mobile data (SQLite local-first).
- Chưa có quản trị nội dung trực tiếp trong app MAUI.
- Chưa có bộ test tự động đầy đủ (unit/integration/UI).
- Một số tài liệu cũ trong `docs/` phản ánh plan theo phase trước đây, có thể không còn đúng 100% với code hiện tại.

## 6) Chạy dự án

- Công cụ: Visual Studio 2022+ với workload .NET MAUI.
- Target frameworks trong `MauiApp1.csproj`: Android, iOS, MacCatalyst, Windows.
- Chạy trên emulator hoặc thiết bị thật (ưu tiên Android để test GPS/QR nhanh).

## 7) Tài liệu kỹ thuật liên quan

- [Kiến trúc lớp (Class Diagram)](file:///c:/Users/KHOA/source/repos/VN-GO-Travel2/ClassDiagram.md)
- [Sơ đồ thực thể (ERD)](file:///c:/Users/KHOA/source/repos/VN-GO-Travel2/ERD.md)
- [Sơ đồ trình tự (Sequence Diagram)](file:///c:/Users/KHOA/source/repos/VN-GO-Travel2/SequenceDiagram.md)
- [Tài liệu tích hợp QR & Deep Link](file:///c:/Users/KHOA/source/repos/VN-GO-Travel2/docs/QR_INTEGRATED_DOCUMENT.md)
- [Kiến trúc hiện tại (MVP)](file:///c:/Users/KHOA/source/repos/VN-GO-Travel2/docs/architecture.md)
- [Giới hạn và sự cố đã biết](file:///c:/Users/KHOA/source/repos/VN-GO-Travel2/docs/known-issues.md)
