# Sequence - Admin Operations Flow

## Participants
- **Actor**: Admin
- **Frontend**: Admin Web Dashboard (React)
- **Backend**: Express API (`admin-user.routes.js`, `zone.routes.js`, `intelligence-admin.routes.js`)
- **Database**: MongoDB (Users, Zones, user_unlock_zones, Intelligence)

## Main Sequences

### 1. Quản lý Zone Pass (Quyền truy cập khu vực)
1. Admin truy cập `ZoneManagementPage`.
2. Frontend gọi `GET /api/zones` để lấy danh sách các khu vực/tour.
3. Backend trả về danh sách kèm giá `Zone Pass`.
4. Admin có thể tạo mới Zone hoặc gán POI vào Zone.
5. Admin cũng có thể gán thủ công `Zone Pass` cho một User cụ thể (Ví dụ: hỗ trợ khách hàng).
6. Frontend gọi `POST /api/admin/users/:id/unlock-zone`.
7. Backend tạo record trong collection `user_unlock_zones`.

### 2. User Management
1. Admin truy cập `UserManagementPage`.
2. Frontend gọi `GET /api/admin/users`.
3. Backend trả về danh sách user. (Trường `isPremium` đã bị loại bỏ, thay bằng kiểm tra danh sách Zone đã sở hữu).
4. Admin có thể kích hoạt/vô hiệu hóa tài khoản (`isActive`).

### 3. Xem Heatmap & Analytics
1. Admin truy cập `GeoHeatmapMap`.
2. Frontend gọi `GET /api/admin/intelligence/metrics/geo-heatmap`.
3. Backend query Aggregation Pipeline từ các event Telemetry.
4. Backend trả về danh sách điểm kèm độ "nóng" (weight).
5. Frontend render Heatmap layer để theo dõi hành vi người dùng tại các Zone.
