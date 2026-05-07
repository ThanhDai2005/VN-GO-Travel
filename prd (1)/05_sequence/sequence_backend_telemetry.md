# Sequence - Backend Telemetry & Intelligence Flow

## Participants
- **System/Actor**: Mobile App (Background Task / Event Tracker)
- **Backend API**: `intelligence.routes.js`, `device.routes.js`
- **Database**: MongoDB (Telemetry Events, Heatmap Data)
- **Consumer**: Admin Web Dashboard

## Main Sequences

### 1. Mobile Sync Telemetry Events
1. Mobile App (MAUI) chạy `QueuedEventTracker` qua Background Service.

> *Vị trí: `QueuedEventTracker` nằm ở file `Services/QueuedEventTracker.cs`, dòng `33`*
2. Ứng dụng tích lũy các event (Audio Play, QR Scan, Geofence Enter) vào local queue.
3. Định kỳ, Mobile App batch các sự kiện lại và gọi `POST /api/intelligence/events/batch` kèm theo JWT/DeviceID.

> *Vị trí: `POST /api/intelligence/events/batch` nằm ở file `backend/src/routes/poi.routes.js`, dòng `16`*
4. Backend nhận batch events và validate payload.
5. Backend normalize data (gán POI ID dựa vào Code, kiểm tra tọa độ).
6. Backend insert bulk vào MongoDB collection `Events`.
7. Backend trả về HTTP 200 OK (Sync thành công).
8. Mobile App xóa các sự kiện đã sync khỏi queue cục bộ.

### 2. Xử lý Dữ liệu Heatmap (Backend Aggregation)
1. Dữ liệu thô nằm trong DB bao gồm các family events (`QR_SCAN`, `AUDIO_START`, `GEOFENCE_TRIGGER`).
2. Tùy chọn: Dữ liệu được tính toán qua cronjob hoặc Pipeline Aggregation để tổng hợp số liệu theo thời gian (Timeline metrics).
3. Đảm bảo dữ liệu tọa độ (Latitude, Longitude) được xử lý loại bỏ nhiễu và map đúng với POI Code chuẩn trong hệ thống (vngo_travel.pois.json hoặc collection POIs).

### 3. Admin Fetch Heatmap Data
1. Admin Web gọi API `GET /api/admin/intelligence/heatmap`.

> *Vị trí: `GET /api/admin/intelligence/heatmap` nằm ở file `backend/src/routes/admin-user.routes.js`, dòng `11`*
2. Backend thực hiện Aggregation MongoDB:
   - **Match**: Lọc các sự kiện hợp lệ, có tọa độ, nằm trong khu vực bounding box cho phép.
   - **Group**: Nhóm theo tọa độ hoặc POI ID.
   - **Project**: Tính toán `weight` (độ "nóng") dựa trên loại sự kiện (VD: QR Scan nặng hơn Geofence trigger).
3. Backend trả về JSON array chứa `{ lat, lng, weight, poiCode }`.
4. Admin Web render lớp nhiệt (Heatmap layer) lên bản đồ hiển thị cho Admin phân tích mật độ.
