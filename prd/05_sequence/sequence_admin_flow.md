# Sequence - Admin Operations Flow

## Participants
- **Actor**: Admin
- **Frontend**: Admin Web Dashboard (React)
- **Backend**: Express API (`admin-user.routes.js`, `intelligence-admin.routes.js`, `premium.routes.js`)
- **Database**: MongoDB (Users, Premium, Intelligence)

## Main Sequences

### 1. Admin Authentication & Dashboard
1. Admin truy cập `LoginPage` và nhập credentials.

> *Vị trí: `LoginPage` nằm ở file `Views/LoginPage.xaml.cs`, dòng `12`*
2. Frontend gọi API Auth, Backend trả về JWT có chứa role `ADMIN`.
3. Admin truy cập `DashboardPage` hoặc Intelligence Overview.

> *Vị trí: `DashboardPage` nằm ở file `admin-web/src/pages/DashboardPage.jsx`, dòng `71`*
4. Frontend gọi API `GET /api/admin/intelligence/summary` và các API metrics.

> *Vị trí: `GET /api/admin/intelligence/summary` nằm ở file `backend/src/routes/admin-user.routes.js`, dòng `11`*
5. Backend tổng hợp dữ liệu từ MongoDB và trả về thống kê tổng quan (User, POI, Revenue).

### 2. User & Premium Management
1. Admin truy cập `UserManagementPage`.

> *Vị trí: `UserManagementPage` nằm ở file `admin-web/src/pages/UserManagementPage.jsx`, dòng `7`*
2. Frontend gọi `GET /api/admin/users` để lấy danh sách user.

> *Vị trí: `GET /api/admin/users` nằm ở file `backend/src/routes/admin-user.routes.js`, dòng `11`*
3. Backend query MongoDB và trả về danh sách user cùng trạng thái Premium.
4. Admin thực hiện kích hoạt/hủy Premium cho user cụ thể.
5. Frontend gọi `POST /api/premium/...` để cập nhật trạng thái.
6. Backend update document user trong MongoDB (cập nhật ngày hết hạn, cờ premium), trả về kết quả thành công.
7. Frontend hiển thị notification cho Admin và refresh danh sách.

### 3. Xem Heatmap & Analytics
1. Admin truy cập `GeoHeatmapMap` hoặc `AuditsPage`.

> *Vị trí: `GeoHeatmapMap` nằm ở file `admin-web/src/pages/intelligence/GeoHeatmapMap.jsx`, dòng `158`*
> *Vị trí: `AuditsPage` nằm ở file `admin-web/src/pages/AuditsPage.jsx`, dòng `4`*
2. Frontend gọi `GET /api/admin/intelligence/metrics/geo-heatmap`.

> *Vị trí: `GET /api/admin/intelligence/metrics/geo-heatmap` nằm ở file `backend/src/routes/admin-user.routes.js`, dòng `11`*
3. Backend query Aggregation Pipeline để nhóm các event telemetry theo tọa độ và POI.
4. Backend trả về danh sách điểm kèm độ "nóng" (weight).
5. Frontend render dữ liệu lên bản đồ tương tác (Heatmap layer) để Admin theo dõi thời gian thực.
