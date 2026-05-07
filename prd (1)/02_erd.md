# 2. ERD (Normalized Production Architecture)

## 2.1 Database Landscape

Hệ thống đã được chuẩn hóa toàn diện (Normalized):
- **Mobile local DB (SQLite `pois.db`)**: Lưu trữ geo-core và quyền sở hữu Zone đã sync.
- **Backend DB (MongoDB Atlas)**: Nguồn dữ liệu chuẩn hóa, hỗ trợ đa ngôn ngữ và event-driven tracking.

## 2.2 Backend MongoDB Collections (Production Ready)

### Collection: `pois` (Core Geospatial & Content)
Lưu trữ thông tin lõi và nội dung mặc định.
- **Fields**:
  - `_id`: ObjectId
  - `code`: String (Unique index)
  - `location`: GeoJSON Point (2dsphere index)
  - `radius`: Number (Bán kính trigger)
  - `priority`: Number (Độ ưu tiên)
  - `name`, `summary`, `narrationShort`, `narrationLong`: String
  - `imageUrl`: String (Thumbnail POI)
  - `unlockPrice`: Number (Credit cost)
  - `status`: String (PENDING | APPROVED | REJECTED)
  - `version`: Number (Sync version)
  - `lastUpdated`: Date

### Collection: `poi_contents` (Multi-Language)
Lưu trữ nội dung văn bản theo từng ngôn ngữ (Bản dịch).

### Collection: `zones` & `zone_pois` (Tour Mapping)
- **`zones`**: Quản lý các vùng/tour du lịch trả phí. (`code`, `name`, `price`, `isActive`)
- **`zone_pois`**: Liên kết N-N giữa Zone và POI.

### Collection: `user_unlock_zones` (Ownership)
Thay thế hệ thống Premium. Lưu vết Tour người dùng đã mua trọn đời.
- **Fields**:
  - `userId`: ObjectId
  - `zoneCode`: String
  - `purchasePrice`: Number
  - `unlockedAt`: Date

### Collection: `intelligence_metrics`
Hệ thống giám sát thực tế: `events_raw`, `geo_heatmap`, `revenue_rollup`.

### Collection: `users`
- **`users`**: `email`, `role` (`ADMIN|USER|OWNER`), `isActive`. (Đã loại bỏ `isPremium`).
- **`user_wallets`**: `userId`, `balance`.

## 2.3 Offline Support Logic
Dữ liệu MongoDB được thiết kế để hỗ trợ:
- **Zone-based unlock**: Khi người dùng mua Zone Pass (Quyền truy cập khu vực), toàn bộ POI thuộc Zone đó được mở khóa `NarrationLong` trong SQLite local.
- **Version-based sync**: Mobile chỉ tải những bản ghi có `version` cao hơn local.

## 2.4 Mobile SQLite mapping
Bảng SQLite trên Mobile:
- `pois`: Dữ liệu cốt lõi và trạng thái `HasAccess` (Dựa trên quyền sở hữu Zone).
- `poi_translations`: Cache bản dịch.
- `downloaded_audio`: Đường dẫn tệp mp3 đã tải về.

## 2.5 Source of Truth
- **Authoritative Source**: MongoDB `pois` + `zones`.
- **Access Source**: `user_unlock_zones` (Dùng để xác định quyền nghe chi tiết - NarrationLong).
