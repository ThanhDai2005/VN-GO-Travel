# 1. Problem And Needs

## 1.1 Real-world Problem

Hệ thống giải quyết bài toán thuyết minh điểm tham quan (POI) cho khách du lịch trong bối cảnh:
- Người dùng di chuyển ngoài trời, mạng không ổn định hoặc mất kết nối.
- Nhu cầu nhận nội dung theo ngôn ngữ cá nhân (không chỉ tiếng Việt).
- Cần truy cập nhanh nội dung tại điểm đến bằng QR hoặc vị trí gần (geofencing), không thao tác nhiều.
- Quản trị viên cần một kênh kiểm duyệt/nạp POI để đồng bộ nội dung ra ứng dụng di động.

Miền nghiệp vụ chính là du lịch tại chỗ (on-site tourism guidance), không phải hệ thống booking hay itinerary planner.

## 1.2 User Pain Points

### Tourist/User (Mobile)
- Không phải lúc nào có Internet; nếu phụ thuộc hoàn toàn API thì trải nghiệm bị đứt.
- Rào cản ngôn ngữ khi nội dung chỉ có tiếng gốc.
- Khó biết khi nào đã vào vùng POI nếu không có cơ chế tự phát hiện vị trí.
- Nếu chỉ dùng bản đồ thủ công, tốc độ truy cập nội dung tại hiện trường chậm.
- TTS có thể bị lặp hoặc chồng phát khi có nhiều trigger gần nhau.

### Admin/Operator
- Dữ liệu POI cần duyệt trước khi public, nhưng luồng quản trị hiện tồn tại song song 2 nhánh (React admin + ASP.NET MVC AdminWeb), gây rủi ro lệch dữ liệu.
- Cần truy xuất audit hành động duyệt/từ chối.

## 1.3 Why Existing Solutions Are Insufficient

- Ứng dụng bản đồ phổ thông không gắn chặt content POI theo workflow kiểm duyệt nội bộ.
- Cách tiếp cận online-only không phù hợp hiện trường du lịch.
- Hệ thống chỉ QR hoặc chỉ GPS đều thiếu: QR nhanh nhưng cần người dùng chủ động; geofence tự động nhưng dễ nhiễu nếu không có cooldown/throttle.
- Lưu localization trực tiếp trong bảng POI chính làm khó mở rộng đa ngôn ngữ và tăng rủi ro trùng lặp dữ liệu.

## 1.4 Proposed Solution (As Implemented)

Giải pháp hiện tại là tổ hợp 3 lớp:
- **QR Entry**: quét mã để mở POI nhanh theo code/token.
- **Geofencing**: theo dõi vị trí chu kỳ, phát hiện vào bán kính POI và tự phát narration.
- **Offline-first + TTS**:
  - Mobile có SQLite local cho lõi địa lý POI.
  - Localization nạp in-memory từ `pois.json`, kết hợp cache bản dịch tự động theo ngôn ngữ.
  - TTS phát nội dung ngắn/dài theo quyền user.

## 1.5 Why This Architecture Was Chosen

## Mobile (.NET MAUI)
- Một codebase cho Android/iOS phù hợp phạm vi đồ án đa nền tảng.
- Tận dụng Shell navigation, DI services và APIs thiết bị (location, speech).

## SQLite On Mobile
- Dùng làm local persistence cho POI lõi (tọa độ, bán kính, priority), đảm bảo chạy cả khi offline.
- Cho phép sync incremental từ backend và hydrate lại collection trong AppState.

## In-memory Localization
- Lookup O(1) nhanh trong runtime.
- Không cần join SQL mỗi lần render/đọc narration.
- Cho phép tiêm dynamic translation ngay sau khi dịch hoặc sync API.

## Dynamic Translation + Translation Cache
- Không bắt buộc chuẩn bị đầy đủ mọi ngôn ngữ từ đầu.
- Cache theo key `CODE|lang` để tái sử dụng kết quả dịch.

## Web Admin + Backend API
- Backend Node/Mongo xử lý kiểm duyệt, quyền, QR token, audit.
- Web Admin ASP.NET MVC (`AdminWeb`) được giữ như tuyến quản trị chính theo cấu trúc đồ án.
- Đồng thời trong repository có nhánh `admin-web` (React) cùng vai trò quản trị qua API.
- Hệ quả: hệ thống thực tế đang ở trạng thái chuyển tiếp đa kênh quản trị, chưa hợp nhất hoàn toàn.

## 1.6 Trade-offs And Current Technical Debt (Mandatory)

## Trade-offs đã chấp nhận
- **Memory vs speed**: giữ localization trong RAM giúp nhanh nhưng tốn bộ nhớ hơn.
- **Complexity tăng**: phải đồng thời quản lý core POI trong SQLite, localization in-memory, và translation cache.
- **Hybrid trigger (QR + geofence)**: UX linh hoạt nhưng dễ tạo cạnh tranh luồng phát âm thanh/navigate nếu điều phối chưa chặt.

## Rủi ro/khiếm khuyết thực tế trong code hiện tại
- **Race/thread-safety localization**: `LocalizationService` lock khi ghi nhưng đọc không lock toàn phần.

> *Vị trí: `LocalizationService` nằm ở file `Services/LocalizationService.cs`, dòng `29`*
  > *Vị trí: `LocalizationService` nằm ở file `Services/LocalizationService.cs`, dòng `29`*

> *Vị trí: `LocalizationService` nằm ở file `Services/LocalizationService.cs`, dòng `29`*
- **Duplicate trigger path narration**: `MapPage` có auto-play riêng, đồng thời `MapViewModel.UpdateLocationAsync` gọi `GeofenceService` cũng có trigger phát.

> *Vị trí: `MapPage` nằm ở file `Views/MapPage.xaml.cs`, dòng `38`*
> *Vị trí: `MapViewModel.UpdateLocationAsync` nằm ở file `ViewModels/MapViewModel.cs`, dòng `299`*
> *Vị trí: `GeofenceService` nằm ở file `Services/GeofenceService.cs`, dòng `30`*
  > *Vị trí: `MapPage` nằm ở file `Views/MapPage.xaml.cs`, dòng `38`*

> *Vị trí: `MapPage` nằm ở file `Views/MapPage.xaml.cs`, dòng `38`*
  > *Vị trí: `MapViewModel.UpdateLocationAsync` nằm ở file `ViewModels/MapViewModel.cs`, dòng `299`*

> *Vị trí: `MapViewModel.UpdateLocationAsync` nằm ở file `ViewModels/MapViewModel.cs`, dòng `299`*
  > *Vị trí: `GeofenceService` nằm ở file `Services/GeofenceService.cs`, dòng `30`*

> *Vị trí: `GeofenceService` nằm ở file `Services/GeofenceService.cs`, dòng `30`*
- **Navigation request drop**: `NavigationService` từ chối request khi đang navigate (`_isNavigating`), có thể mất thao tác hợp lệ.

> *Vị trí: `NavigationService` nằm ở file `Services/NavigationService.cs`, dòng `17`*
  > *Vị trí: `NavigationService` nằm ở file `Services/NavigationService.cs`, dòng `17`*

> *Vị trí: `NavigationService` nằm ở file `Services/NavigationService.cs`, dòng `17`*
- **Sync-over-async stop audio**: `PoiNarrationService.Stop()` dùng `.GetAwaiter().GetResult()` có nguy cơ block thread.
- **Contract mismatch DB language API**: `GetExactByCodeAndLanguageAsync` hiện không lọc ngôn ngữ thực sự.
- **Admin architecture split**: tồn tại cả `admin-web` (React, API-driven) và `AdminWeb` (ASP.NET MVC + SQLite riêng), chưa hợp nhất source-of-truth cho quản trị.

## 1.7 System Context Separation (3 Main Parts)

## (A) Mobile App (.NET MAUI)
- Trách nhiệm: trải nghiệm người dùng cuối (map/qr/geofence/tts/offline).
- Dữ liệu runtime: AppState + SQLite local + in-memory localization.

## (B) Backend API (Node.js + MongoDB)
- Trách nhiệm: xác thực/phân quyền, quản lý POI, kiểm duyệt, audit, QR token scan flow, giới hạn quét free.

## (C) Web Admin
- Tuyến theo bối cảnh chấm đồ án: `AdminWeb` ASP.NET MVC.
- Trạng thái thực tế codebase: có thêm `admin-web` React cùng tồn tại.
- Điểm cần nêu khi bảo vệ: 2 tuyến admin chưa hợp nhất source-of-truth hoàn toàn.

## Unified System View
- Backend Mongo là nguồn nghiệp vụ server-side cho POI đã duyệt.
- Mobile giữ bản local phục vụ offline và hydrate theo ngôn ngữ.
- Admin UI thao tác vòng đời POI trước khi dữ liệu được app mobile đồng bộ.
