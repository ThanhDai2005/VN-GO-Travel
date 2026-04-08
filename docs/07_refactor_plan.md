# 7. Refactor Plan

## Mục tiêu
Khóa lại luồng nghiệp vụ cốt lõi, cập nhật docs khớp với code hiện tại, và chuẩn bị nền tảng sạch để hoàn tất QR flow theo hướng thực tế hơn mà không phá app đang chạy.

---

## 1. Tình trạng hiện tại

Dự án hiện đã có:
- dữ liệu POI từ `Resources/Raw/pois.json`
- model `Poi`
- `PoiDatabase`
- `MapViewModel`
- các service liên quan đến location / geofence / audio
- `QrScannerPage`
- `QrScannerViewModel`
- `QrResolver`
- `PoiDetailPage`
- bộ docs nền tảng

### Trạng thái QR hiện tại
In-app QR flow đã hoạt động và hỗ trợ cả link-based parsing INSIDE scanner:
1. mở scanner page
2. camera đọc payload
3. `QrResolver` trích `Code` từ `poi:`, `poi://`, plain `CODE`, hoặc từ URL path `/poi/{CODE}` / `/p/{CODE}`
4. lookup local DB
5. mở `PoiDetailPage`

Chưa có (planned/future):
- OS-level app links / intent filters / universal links
- landing page / public web redirect
- external camera end-to-end deep-link handling

---

## 2. Mục tiêu của refactor

Refactor trong giai đoạn này không nhằm viết lại toàn bộ dự án, mà nhằm:
- khóa lại flow QR hiện tại
- tách rõ trách nhiệm giữa scanner page, parser, navigation, map focus
- giảm việc code-behind gánh quá nhiều logic
- chuẩn bị nền tảng tốt để hoàn tất MVP QR
- hỗ trợ mở rộng sang deep link / landing page sau này

---

## 3. Nguyên tắc refactor

### 3.1. Không refactor toàn bộ cùng lúc
Chỉ chỉnh những phần có liên quan trực tiếp đến:
- QR scanner
- QR parsing
- POI resolution
- detail flow
- map focus
- audio conflict rule

### 3.2. Docs đi trước code
Mỗi thay đổi lớn cần đối chiếu với:
- `04_mvp_scope.md`
- `05_core_business_rules.md`
- `06_simple_architecture.md`
- `08_test_checklist.md`
- `09_qr_strategy.md`

### 3.3. Không thêm feature ngoài scope hiện tại
Chưa làm ngay:
- landing page production
- analytics QR
- server-managed QR
- deferred deep link hoàn chỉnh

---

## 4. Những phần nên giữ nguyên trước mắt

### 4.1. Cấu trúc thư mục chính
Giữ nguyên:
- `Models`
- `Services`
- `ViewModels`
- `Views`
- `Resources/Raw`
- `docs`

### 4.2. Dữ liệu POI hiện tại
Giữ format POI hiện tại trong `pois.json`:
- `Code`
- `Latitude`
- `Longitude`
- `Radius`
- `Priority`
- `LanguageCode`
- `Name`
- `Summary`
- `NarrationShort`
- `NarrationLong`

### 4.3. Flow QR hiện tại
Giữ flow scan -> parse -> lookup DB -> mở detail.  
Không ép refactor sang deep link ngay trong đợt này.

---

## 5. Những phần cần làm rõ thêm trong code

### 5.1. `QrResolver`
- sửa bug thứ tự parse:
  - phải check `poi://` trước `poi:`
- mở rộng parser cho link-based QR
- trả về type/source nếu cần debug tốt hơn

### 5.2. `QrScannerViewModel`
- giữ luồng hiện tại: parse -> lookup -> open detail
- đảm bảo cơ chế hạn chế double navigation đang hoạt động
- tránh mở rộng chức năng deep link ở giai đoạn này

### 5.3. `MapViewModel` + `MapPage`
- giữ cơ chế pending focus
- đảm bảo `OpenOnMap` từ detail không sinh thêm stack bất thường
- giảm lỗi push page dư / kẹt flow

### 5.4. Audio conflict rule
- xác định rõ khi đang có audio geofence thì QR detail/manual play sẽ làm gì
- mặc định đề xuất:
  - geofence auto: skip nếu đang bận
  - manual từ detail: stop audio hiện tại và phát mới

---

## 6. Những phần nên bổ sung tiếp theo

### 6.1. Docs
Bổ sung:
- sequence QR hiện tại
- sequence QR target
- implementation prompt cho AI coding assistant

### 6.2. Service / Model có thể bổ sung
- `DeepLinkHandler`
- `QrLinkParserResult`
- `QrNavigationCoordinator`
- `PlaybackState` hoặc `PlaybackPolicy`

---

## 7. Kế hoạch refactor theo thứ tự

### Giai đoạn 1 — Khóa docs và rule
- chuẩn hóa docs hiện có
- chốt sequence hiện tại
- chốt target sequence

### Giai đoạn 2 — Sửa lỗi parser và QR flow
- sửa parse order bug `poi://`
- mở rộng parser cho URL
- đảm bảo route/detail flow ổn định

### Giai đoạn 3 — Chuẩn bị deep link
- đăng ký route/app link
- tạo entry point xử lý URL
- dùng lại chung logic `Code -> POI`

### Giai đoạn 4 — Hoàn tất MVP QR
- test offline/local data
- test external camera scenario
- test manual narration / open on map
- đóng gói docs + prompt cho vibe coding

---

## 8. Refactor success criteria
- docs khớp code hiện tại
- parser không còn bug format
- scan QR mở đúng detail ổn định
- open on map từ detail ổn định
- có tài liệu đủ rõ để Copilot/Cursor bám đúng flow
