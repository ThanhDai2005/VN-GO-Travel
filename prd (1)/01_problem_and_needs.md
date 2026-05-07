# 1. Problem And Needs

## 1.1 Real-world Problem

Hệ thống giải quyết bài toán thuyết minh điểm tham quan (POI) cho khách du lịch trong bối cảnh:
- Người dùng di chuyển ngoài trời, mạng không ổn định hoặc mất kết nối.
- Nhu cầu nhận nội dung theo ngôn ngữ cá nhân (không chỉ tiếng Việt).
- Cần truy cập nhanh nội dung tại điểm đến bằng QR hoặc vị trí gần (geofencing), không thao tác nhiều.
- Quản trị viên cần một kênh kiểm duyệt/nạp POI để đồng bộ dữ liệu chuẩn xác xuống ứng dụng di động.

Miền nghiệp vụ chính là du lịch tại chỗ (on-site tourism guidance), không phải hệ thống booking hay itinerary planner.

## 1.2 User Pain Points

### Tourist/User (Mobile)
- Không phải lúc nào có Internet; nếu phụ thuộc hoàn toàn API thì trải nghiệm bị đứt.
- Rào cản ngôn ngữ khi nội dung chỉ có tiếng gốc.
- Không nhận biết được thời điểm bước vào vùng POI nếu thiếu cơ chế tự phát hiện vị trí.
- Nếu chỉ dùng bản đồ thủ công, tốc độ truy cập nội dung tại hiện trường chậm.
- TTS có thể bị lặp hoặc chồng phát khi có nhiều trigger gần nhau.

### Admin/Operator
- Dữ liệu POI cần duyệt trước khi public.
- Cần cơ chế quản lý Tour/Vùng (Zone) trả phí chuyên nghiệp.
- Cần truy xuất audit hành động duyệt/từ chối.

## 1.3 Why Existing Solutions Are Insufficient

- Ứng dụng bản đồ phổ thông không gắn chặt content POI theo workflow kiểm duyệt nội bộ.
- Cách tiếp cận online-only không phù hợp hiện trường du lịch.
- Hệ thống chỉ QR hoặc chỉ GPS đều thiếu: QR nhanh nhưng cần người dùng chủ động; geofence tự động nhưng dễ nhiễu nếu không có cooldown/throttle.
- Lưu localization trực tiếp trong bảng POI chính làm khó mở rộng đa ngôn ngữ và tăng rủi ro trùng lặp dữ liệu.

## 1.4 Proposed Solution (As Implemented)

Giải pháp hiện tại là tổ hợp 3 lớp:
- **QR Entry**: quét mã để mở POI nhanh theo code/token (không giới hạn lượt quét).
- **Geofencing**: theo dõi vị trí chu kỳ, phát hiện vào bán kính POI và tự phát narration.
- **Offline-first + TTS**:
  - Mobile có SQLite local cho lõi địa lý POI.
  - Localization nạp in-memory từ `pois.json`, kết hợp cache bản dịch tự động theo ngôn ngữ.
  - TTS phát nội dung ngắn (Miễn phí) hoặc dài (Sau khi sở hữu Zone Pass).

## 1.5 Why This Architecture Was Chosen

## Mobile (.NET MAUI)
- Một codebase cho Android/iOS phù hợp phạm vi đồ án đa nền tảng.
- Tận dụng Shell navigation, DI services và APIs thiết bị (location, speech).

## SQLite On Mobile
- Dùng làm local persistence cho POI lõi (tọa độ, bán kính, priority), đảm bảo chạy cả khi offline.
- Cho phép sync incremental từ backend và hydrate lại collection trong AppState.

## In-memory Localization
- Lookup O(1) nhanh trong runtime.
- Loại bỏ chi phí truy vấn SQL (JOIN) mỗi lần hiển thị hoặc đọc narration.
- Cho phép tiêm dynamic translation ngay sau khi dịch hoặc sync API.

## Dynamic Translation + Translation Cache
- Không bắt buộc chuẩn bị đầy đủ mọi ngôn ngữ từ đầu.
- Cache theo key `CODE|lang` để tái sử dụng kết quả dịch.

## Web Admin + Backend API
- Backend Node/Mongo xử lý kiểm duyệt, quyền, QR token, audit.
- Loại bỏ hoàn toàn giới hạn số lượt quét QR để tối ưu hóa trải nghiệm.
- Thay thế mô hình gói cước theo thời gian bằng "Zone Pass" (Quyền truy cập khu vực trọn đời).

## 1.6 Trade-offs And Current Technical Debt (Mandatory)

## Trade-offs đã chấp nhận
- **Memory vs speed**: giữ localization trong RAM giúp nhanh nhưng tốn bộ nhớ hơn.
- **Complexity tăng**: phải đồng thời quản lý core POI trong SQLite, localization in-memory, và translation cache.
- **Hybrid trigger (QR + geofence)**: UX linh hoạt nhưng dễ tạo cạnh tranh luồng phát âm thanh/navigate nếu điều phối chưa chặt.

## Rủi ro/khiếm khuyết thực tế trong code hiện tại (Đã fix một phần)
- **Race/thread-safety localization**: `LocalizationService` đã được gia cố logic gán dữ liệu.
- **Duplicate trigger path narration**: Hệ thống đã có cơ chế Cooldown và Jitter chống lặp.
- **Navigation request drop**: Navigation hiện tại đã an toàn hơn với Semaphore lock.

## 1.7 System Context Separation (3 Main Parts)

## (A) Mobile App (.NET MAUI)
- Trách nhiệm: trải nghiệm người dùng cuối (map/qr/geofence/tts/offline).
- Dữ liệu runtime: AppState + SQLite local + in-memory localization.

## (B) Backend API (Node.js + MongoDB)
- Trách nhiệm: xác thực/phân quyền, quản lý POI, kiểm duyệt, audit, quản lý mua Zone Pass.

## (C) Web Admin
- Quản trị toàn diện POI, Zone, Duyệt bài từ Owner và Giám sát thiết bị thông qua Intelligence Hub.

## Unified System View
- Backend Mongo là nguồn nghiệp vụ server-side cho POI đã duyệt và Tour đã bán.
- Mobile giữ bản local phục vụ offline và hydrate theo ngôn ngữ.
- Admin UI thao tác vòng đời POI trước khi dữ liệu được app mobile đồng bộ.
