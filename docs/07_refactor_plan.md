# 7. Refactor Plan

## Mục tiêu
Tài liệu này dùng để xác định những phần nào trong dự án cần giữ nguyên, phần nào cần chỉnh sửa, và phần nào nên bổ sung để đưa ứng dụng từ trạng thái “đã code được lõi” sang trạng thái “ổn định, rõ nghiệp vụ, dễ mở rộng”.

---

## 1. Tình trạng hiện tại

Dự án hiện đã có các thành phần cốt lõi:
- dữ liệu POI từ `Resources/Raw/pois.json`
- model `Poi`
- `MapViewModel`
- các service liên quan đến location / geofence / audio
- giao diện `MapPage`, `AboutPage`, `ExplorePage`
- tài liệu nền tảng trong thư mục `docs/`

Tuy nhiên, dự án ban đầu được phát triển theo hướng nhảy vào code sớm, chưa khóa rõ PRD và business rules, nên việc sửa lỗi và tối ưu mất nhiều thời gian.

---

## 2. Mục tiêu của refactor

Refactor trong giai đoạn này không nhằm viết lại toàn bộ dự án, mà nhằm:
- khóa lại luồng nghiệp vụ cốt lõi
- tách rõ trách nhiệm giữa các lớp
- giảm việc code-behind gánh quá nhiều logic
- chuẩn bị nền tảng tốt để hoàn tất MVP
- hỗ trợ mở rộng sau này như QR code, CMS, AI integration

---

## 3. Nguyên tắc refactor

### 3.1. Không refactor toàn bộ cùng lúc
Chỉ chỉnh những phần có liên quan trực tiếp đến:
- GPS / geofence
- narration
- dữ liệu POI
- map flow

### 3.2. Docs đi trước code
Mỗi thay đổi lớn cần đối chiếu với:
- `03_poc_scope.md`
- `04_mvp_scope.md`
- `05_core_business_rules.md`
- `06_simple_architecture.md`

### 3.3. Không thêm tính năng mới khi rule chưa rõ
Nếu chưa chốt rõ business rule thì chưa nên thêm:
- QR scanner hoàn chỉnh
- audio queue phức tạp
- AI API
- backend/CMS

---

## 4. Những phần nên giữ nguyên trước mắt

### 4.1. Cấu trúc thư mục chính
Giữ nguyên các thư mục:
- `Models`
- `Services`
- `ViewModels`
- `Views`
- `Resources/Raw`
- `docs`

### 4.2. Dữ liệu POI hiện tại
Giữ format POI hiện tại trong `pois.json`:
- Code
- Latitude
- Longitude
- Radius
- Priority
- LanguageCode
- Name
- Summary
- NarrationShort
- NarrationLong

Đây là format đủ tốt cho PoC và MVP cơ bản.

### 4.3. Tinh thần kiến trúc hiện tại
Giữ hướng phân tách:
- UI
- ViewModel
- Service
- Model
- Data source local

---

## 5. Những phần cần làm rõ thêm trong code

### 5.1. Geofence rule
Cần làm rõ trong code và docs:
- điều kiện xác định “đã vào vùng”
- nếu nhiều POI cùng hợp lệ thì chọn theo gì
- khi nào một POI được phép phát lại
- cooldown đang dùng bao lâu
- có debounce chưa
- manual play và auto play tương tác thế nào

### 5.2. Audio/Narration rule
Cần làm rõ:
- chỉ một audio được phát tại một thời điểm
- nếu đang phát audio khác thì auto trigger làm gì
- manual play có được interrupt không
- khi thiếu audio file thì fallback sang TTS thế nào
- ưu tiên `NarrationShort` hay `NarrationLong`

### 5.3. Map flow
Cần giảm bớt logic nằm trực tiếp trong `MapPage.xaml.cs`.
Mục tiêu lâu dài:
- `MapPage` chủ yếu lo hiển thị
- `MapViewModel` lo dữ liệu và state
- `Services` lo xử lý nghiệp vụ

---

## 6. Những phần nên bổ sung tiếp theo

### 6.1. Docs
Bổ sung và cập nhật:
- `07_refactor_plan.md`
- `08_test_checklist.md`

### 6.2. Service / Model có thể bổ sung sau
Khi sang giai đoạn MVP hoàn thiện hơn, có thể thêm:
- `PlaybackLog`
- `QrService`
- `QrScannerViewModel`
- `PoiDetailViewModel`
- `SettingsViewModel`

### 6.3. Thư mục tích hợp AI
Hiện tại chưa dùng AI API.
Chỉ cần chuẩn bị:
- `Integrations/AI/README.md`

---

## 7. Kế hoạch refactor theo thứ tự

### Giai đoạn 1 — Khóa rule
- rà soát `05_core_business_rules.md`
- ghi rõ geofence rule
- ghi rõ audio rule
- ghi rõ offline rule
- ghi rõ QR strategy (chưa cần code)

### Giai đoạn 2 — Test trước
- viết test cho logic geofence
- viết test cho load/fallback dữ liệu POI

### Giai đoạn 3 — Dọn lại flow lõi
- giảm logic trong `MapPage`
- giữ service làm đúng trách nhiệm
- tránh UI tự xử lý nghiệp vụ phức tạp

### Giai đoạn 4 — Bổ sung MVP features
- POI detail page
- settings page
- QR scan flow
- chọn ngôn ngữ rõ ràng hơn

---

## 8. QR code sẽ được xử lý như thế nào

Hiện tại dự án chưa có chức năng QR code.

### Hướng xử lý đề xuất
QR sẽ không thay thế geofence.
QR là một trigger phụ để truy cập đúng POI.

### Dữ liệu trong QR
Đề xuất format đơn giản:
`poi:CODE`

Ví dụ:
`poi:HO_TAY`

### Luồng xử lý
1. User mở màn quét QR
2. App scan ra chuỗi
3. Parse `Code`
4. Tìm POI theo `Code`
5. Mở trang chi tiết POI
6. User có thể bấm nghe narration

### Ghi chú
Không bắt buộc phải lưu sẵn ảnh QR trong từng POI.
Có thể tạo ảnh QR sau này từ `Code` nếu cần in ấn hoặc demo.

---

## 9. Những thứ chưa làm ở giai đoạn này

Chưa ưu tiên:
- AI API
- CMS web
- analytics
- backend phức tạp
- queue audio nâng cao
- bản đồ offline nâng cao
- QR quản lý bởi server

---

## 10. Kết quả mong muốn sau refactor

Sau giai đoạn refactor này, dự án cần đạt:
- rule rõ hơn
- code dễ hiểu hơn
- dễ test hơn
- ít bug logic hơn
- sẵn sàng để hoàn tất MVP

## QR Refactor Direction

QR cần được thiết kế theo hướng nhiều ngữ cảnh sử dụng, không chỉ scan trong app.

### Giai đoạn 1
- hỗ trợ scan trong app với format `poi:CODE`

### Giai đoạn 2
- hỗ trợ link-based QR
- thêm cơ chế mở app tới đúng POI từ QR link

### Giai đoạn 3
- xem xét landing page cho user chưa có app
- xem xét fallback khi user scan bằng camera ngoài app