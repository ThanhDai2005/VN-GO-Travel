# 2. ERD (Normalized Production Architecture)

## 2.1 Database Landscape

Hệ thống đã được chuẩn hóa toàn diện (Normalized):
- **Mobile local DB (SQLite `pois.db`)**: Lưu trữ geo-core và nội dung đa ngôn ngữ đã sync.
- **Backend DB (MongoDB Atlas)**: Nguồn dữ liệu chuẩn hóa, hỗ trợ đa ngôn ngữ và event-driven tracking.

## 2.2 Backend MongoDB Collections (Production Ready)

### Collection: `pois` (Core Geospatial)
Lưu trữ thông tin lõi về vị trí, không chứa nội dung ngôn ngữ.
- **Fields**:
  - `_id`: ObjectId
  - `code`: String (Unique index) - Định danh duy nhất cho POI.
  - `location`: GeoJSON Point (2dsphere index) - Tọa độ thực tế.
  - `radius`: Number - Bán kính trigger.
  - `priority`: Number - Độ ưu tiên hiển thị.
  - `isActive`: Boolean - Trạng thái hoạt động.
  - `createdAt`, `updatedAt`: Date

### Collection: `poi_contents` (Multi-Language)
Lưu trữ nội dung văn bản theo từng ngôn ngữ.
- **Fields**:
  - `poiId`: ObjectId (Ref `pois`)
  - `languageCode`: String (e.g., "vi", "en", "ja")
  - `name`: String
  - `summary`: String
  - `description`: String (Markdown support)
  - `version`: Number
  - `updatedAt`: Date
- **Index**: Unique compound index `{poiId: 1, languageCode: 1}`.

### Collection: `audio_assets` (Media Management)
Quản lý các file âm thanh thuyết minh bên ngoài.
- **Fields**:
  - `poiId`: ObjectId (Ref `pois`)
  - `languageCode`: String
  - `type`: String ("short" | "long")
  - `voice`: String (tên voice engine/người đọc)
  - `fileUrl`: String (Link CDN/Storage)
  - `duration`: Number (giây)
  - `fileSize`: Number (bytes)
  - `checksum`: String (đảm bảo tính toàn vẹn khi tải offline)
  - `version`: Number
- **Index**: Index `{poiId: 1, languageCode: 1, type: 1}`.

### Collection: `zones` & `zone_pois` (System Mapping)
- **`zones`**: Quản lý các vùng/tour du lịch trả phí. (`code`, `name`, `price`, `isActive`)
- **`zone_pois`**: Liên kết N-N giữa Zone và POI. (`zoneId`, `poiId`, `orderIndex`)

### Collection: `users` & `user_wallets`
- **`users`**: `email`, `role` (`ADMIN|USER|OWNER`), `isPremium`, `createdAt`.
- **`user_wallets`**: `userId`, `balance` (Tách biệt logic tài chính khỏi profile).

### Collection: `user_poi_events` (Event Driven Tracking)
Thay thế hoàn toàn các counter cũ (qrScanCount). Lưu vết mọi tương tác.
- **Fields**:
  - `userId`: ObjectId (null nếu là guest)
  - `poiId`: ObjectId
  - `eventType`: String (`enter` | `qr_scan` | `audio_start` | `audio_complete`)
  - `duration`: Number (thời gian nghe/ở lại)
  - `deviceId`: String
  - `createdAt`: Date (Index cho Heatmap/Analytics)

### Collection: `unlock_system`
- **`user_unlock_pois`**: Lưu vết POI đã mua lẻ.
- **`user_unlock_zones`**: Lưu vết Zone/Tour đã mua.

### Collection: `admin_audit`
- **`poi_submissions`**: Quy trình phê duyệt POI mới từ cộng đồng.
- **`admin_audit_logs`**: Lưu vết mọi thao tác nhạy cảm của Admin (`action`, `entityType`, `oldValue`, `newValue`).

## 2.3 Offline Support Logic
Dữ liệu MongoDB được thiết kế để hỗ trợ:
- **Version-based sync**: Mobile chỉ tải những bản ghi có `version` cao hơn local.
- **Delta updates**: Tách biệt `poi_contents` giúp cập nhật bản dịch mà không cần tải lại geo-data.
- **Idempotent downloads**: `audio_assets.checksum` giúp client xác định file đã tải đúng hay chưa, tránh tải lặp.

## 2.4 Mobile SQLite mapping
Bảng SQLite trên Mobile sẽ được ánh xạ tương ứng để hỗ trợ offline hoàn toàn:
- `pois` (local) = `pois` (remote) + `poi_contents` (theo ngôn ngữ hiện tại của user).
- `poi_translation_cache` (local) = Lưu trữ các bản dịch tức thời từ AI nếu remote chưa có bản dịch chính thức.

## 2.5 Source of Truth
- **Authoritative Source**: MongoDB `pois` + `poi_contents` (APPROVED status).
- **Analytics Source**: `user_poi_events` (Dùng để dựng Heatmap và báo cáo doanh thu).
