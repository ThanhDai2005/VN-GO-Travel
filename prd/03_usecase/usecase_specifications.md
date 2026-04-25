# 3. Use Case Specifications

## UC-M1: View Map And Nearby POIs
- **Actor**: Tourist/User
- **Description**: Người dùng mở bản đồ, hệ thống tải POI local và render pin/radius.
- **Preconditions**:
  - App khởi động thành công.
  - SQLite có dữ liệu hoặc có thể seed từ `pois.json`.
- **Main Flow**:
  1. User mở `MapPage`.

> *Vị trí: `MapPage` nằm ở file `Views/MapPage.xaml.cs`, dòng `38`*
  2. ViewModel gọi load POIs (init DB, init localization, seed nếu DB rỗng).
  3. Hệ thống hydrate POI với localization theo ngôn ngữ hiện tại.
  4. Map vẽ pin + vòng bán kính.
- **Alternative Flows**:
  - Nếu sync server lỗi, app vẫn dùng dữ liệu local.
  - Nếu thiếu localization, hệ thống fallback ngôn ngữ.
- **Postconditions**:
  - POI hiển thị trên map.
  - AppState giữ collection POI hiện hành.

## UC-M2: Scan QR To Open POI
- **Actor**: Tourist/User
- **Description**: Quét QR hoặc nhập thủ công để mở POI theo code/token.
- **Preconditions**:
  - Màn hình scanner hoạt động.
  - Input QR hợp lệ theo parser.
- **Main Flow**:
  1. Scanner nhận raw input.
  2. `PoiEntryCoordinator` parse input (code hoặc secure token).

> *Vị trí: `PoiEntryCoordinator` nằm ở file `Services/PoiEntryCoordinator.cs`, dòng `39`*
  3. Nếu token: gọi backend `/pois/scan`, merge kết quả vào local.
  4. Xây route map/detail và điều hướng.
- **Alternative Flows**:
  - Input sai format -> báo lỗi và về trạng thái ready.
  - POI không có local -> không điều hướng.
  - Duplicate trong cửa sổ ngắn -> suppressed (không navigate lại).
- **Postconditions**:
  - User ở map/detail của POI hoặc nhận lỗi rõ ràng.

## UC-M3: Auto Detect POI By Geofencing
- **Actor**: System (auto), Tourist/User (thụ hưởng)
- **Description**: Hệ thống định kỳ lấy vị trí, xác định POI trong bán kính và trigger narration.
- **Preconditions**:
  - Tracking loop đang chạy.
  - Có location hợp lệ.
  - Modal không mở.
- **Main Flow**:
  1. Timer 5s gọi update location.
  2. Geofence kiểm tra throttle/jitter/cooldown.
  3. Chọn candidate theo priority rồi khoảng cách.
  4. Trigger narration cho POI tốt nhất.
- **Alternative Flows**:
  - Nếu không có candidate: clear active POI.
  - Nếu gate bận hoặc cooldown chưa hết: suppress trigger.
- **Postconditions**:
  - Active narration/selection cập nhật theo vị trí mới.

## UC-M4: Listen Narration (Short/Long)
- **Actor**: Tourist/User
- **Description**: Nghe thuyết minh POI; long narration yêu cầu premium.
- **Preconditions**:
  - POI đã selected.
- **Main Flow**:
  1. User bấm phát.
  2. Service dừng audio cũ, phát nội dung mới theo ngôn ngữ.
  3. Nếu detailed và user premium -> phát narration dài.
- **Alternative Flows**:
  - User free bấm detailed -> hiển thị upsell premium.
  - Stop được gọi -> ngắt TTS.
- **Postconditions**:
  - Audio playback state cập nhật đúng POI hiện tại.

## UC-M5: Change Language
- **Actor**: Tourist/User
- **Description**: Đổi ngôn ngữ hiển thị/narration.
- **Preconditions**:
  - Language selector mở được.
- **Main Flow**:
  1. User chọn ngôn ngữ.
  2. System rehydrate POIs theo ngôn ngữ mới.
  3. Nếu thiếu dữ liệu ngôn ngữ, fallback chain áp dụng.
- **Alternative Flows**:
  - Với ngôn ngữ không có curated content, translation cache/auto-translation được dùng khi có.
- **Postconditions**:
  - AppState.CurrentLanguage và POI collection đồng bộ.

## UC-B1: Sync Nearby POIs To Mobile
- **Actor**: System (mobile service + backend API)
- **Description**: Mobile gọi backend để lấy POIs approved và upsert local.
- **Preconditions**:
  - User authenticated trên mobile (theo logic hiện tại sync).
- **Main Flow**:
  1. Mobile gọi `GET /api/v1/pois/nearby`.

> *Vị trí: `GET /api/v1/pois/nearby` nằm ở file `backend/src/routes/admin-user.routes.js`, dòng `11`*
  2. Backend trả list POI đã public.
  3. Mobile upsert geo core vào SQLite.
  4. Mobile inject nội dung vi vào localization in-memory.
- **Alternative Flows**:
  - API lỗi -> bỏ qua sync, không crash app.
- **Postconditions**:
  - Local dataset được làm mới một phần.

## UC-B2: Redeem Secure QR Token
- **Actor**: Tourist/User, System
- **Description**: Backend xác thực JWT token, kiểm tra trạng thái POI và quota scan.
- **Preconditions**:
  - User đăng nhập.
  - Token hợp lệ.
- **Main Flow**:
  1. Client gửi token.
  2. Backend verify JWT.
  3. Tìm POI theo code/id trong payload.
  4. Kiểm tra status và premium rules.
  5. Nếu user free: tăng `qrScanCount` nếu chưa vượt limit.
- **Alternative Flows**:
  - Token invalid/expired -> 401.
  - POI pending/rejected -> 403.
  - Hết quota free -> 403.
- **Postconditions**:
  - Trả POI DTO đủ dữ liệu cho client merge/navigate.

## UC-W1: Admin Manage Master POIs
- **Actor**: Admin
- **Description**: Quản trị viên CRUD POI toàn cục.
- **Preconditions**:
  - Admin authenticated.
- **Main Flow**:
  1. Mở trang master POI.
  2. Gọi API list master.
  3. Tạo/sửa/xóa POI qua API backend.
- **Alternative Flows**:
  - Validate fail (code/name/location) -> backend trả lỗi.
- **Postconditions**:
  - POI được cập nhật trên Mongo.

## UC-W2: Admin Approve/Reject Owner Submission
- **Actor**: Admin
- **Description**: Duyệt POI trạng thái pending.
- **Preconditions**:
  - POI ở trạng thái pending.
- **Main Flow**:
  1. Admin xem danh sách pending.
  2. Chọn approve hoặc reject (kèm reason khi reject).
  3. Backend transition status + ghi audit.
- **Alternative Flows**:
  - Transition conflict do trạng thái đã đổi -> trả conflict.
- **Postconditions**:
  - Status POI cập nhật và có bản ghi audit.

## UC-W3: User Management
- **Actor**: Admin
- **Description**: Quản lý role/status/thông tin user.
- **Preconditions**:
  - Admin đã login.
- **Main Flow**:
  1. Mở trang user management.
  2. Xem danh sách user (lọc admin hiện tại).
  3. Cập nhật role/status hoặc chỉnh sửa profile.
- **Alternative Flows (real issue)**:
  - Form tạo user hiện có binding lỗi trùng trường `Họ tên` dùng `editForm.fullName`, gây nguy cơ dữ liệu tạo mới sai.
- **Postconditions**:
  - User record thay đổi theo API response.

## UC-W5: ASP.NET MVC AdminWeb JSON Sync
- **Actor**: Admin (legacy flow)
- **Description**: AdminWeb ASP.NET MVC import/export POI từ JSON vào SQLite riêng.
- **Preconditions**:
  - Chạy ứng dụng `AdminWeb`.
- **Main Flow**:
  1. DB local `pois-admin.db` ensure created.
  2. Nếu rỗng, seed từ `Resources/Raw/pois.json`.
- **Alternative Flows**:
  - Có thể lệch với backend Mongo nếu chỉnh sửa ở nhánh khác.
- **Postconditions**:
  - Dữ liệu admin local tồn tại nhưng không phải luồng duy nhất toàn hệ thống.

## NOTE (Honesty For Defense)
- Repository hiện có thêm một web admin React (`admin-web`) dùng API backend.
- Vì vậy UC-W1..W4 có thể được thực thi từ React UI, còn UC-W5 là đặc thù của nhánh ASP.NET MVC (`AdminWeb`).
