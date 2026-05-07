# 3. Use Case Overview

## 3.1 Actors

- **Tourist/User (Mobile App)**
  - Xem bản đồ, quét QR, nghe thuyết minh, đổi ngôn ngữ.
- **Owner (Người sở hữu điểm tham quan)**
  - Đăng ký tài khoản Owner, gửi yêu cầu tạo/sửa/xóa POI, xem thống kê (Timeline, Heatmap) riêng cho các POI của mình.
- **Admin**
  - Quản lý toàn bộ hệ thống, duyệt POI, quản lý Zone (Tour), xem báo cáo Intelligence (Doanh thu, Heatmap toàn hệ thống), quản lý thiết bị/phiên làm việc.
- **System (Auto Processes)**
  - Theo dõi vị trí, geofence trigger, fallback localization, sync dữ liệu, cache translation.

## 3.2 Main Business Functions (Non-technical naming)

- Xem bản đồ POI xung quanh.
- Quét mã QR để mở nhanh nội dung POI.
- Tự động phát hiện đang ở gần POI (geofencing).
- Nghe thuyết minh ngắn/dài (theo quyền miễn phí/Zone Pass).
- Đổi ngôn ngữ hiển thị.
- Mua Zone Pass (Quyền truy cập khu vực) để nghe thuyết minh chi tiết.
- Quản trị POI và duyệt nội dung do owner gửi.
- Quản lý tài khoản người dùng.

## 3.3 System Partition By Use Case

## Mobile (.NET MAUI)
- UC-M1: Mở bản đồ và hiển thị POI.
- UC-M2: Quét QR và điều hướng vào POI.
- UC-M3: Auto-detect POI theo vị trí.
- UC-M4: Phát thuyết minh (Short/Detailed).
- UC-M5: Chuyển ngôn ngữ và fallback.
- UC-M6: Mua Zone Pass.

## Backend API (Node + Mongo)
- UC-B1: Cấp dữ liệu POI nearby cho mobile sync.
- UC-B2: Xử lý scan token và kiểm tra quyền.
- UC-B3: Moderation POI (approve/reject).
- UC-B4: Quản lý user/admin.
- UC-B5: Quản lý thanh toán và sở hữu Zone Pass.

## Web Admin
- UC-W1: CRUD POI master.
- UC-W2: Duyệt owner submissions.
- UC-W3: Xem audit moderation.
- UC-W4: Quản lý role/status tài khoản.
- UC-W5: Quản lý Zone (Khu vực/Tour du lịch) và gán POI vào Zone.
- UC-W6: Xem phân tích Intelligence (Heatmap tương tác, biểu đồ doanh thu, timeline sự kiện).
- UC-W7: Quản lý thiết bị (Device sessions) và giám sát trạng thái Online/Offline.

## 3.4 Real Constraints Affecting Use Cases

- Mobile navigation được serialize để giảm race nhưng có thể bỏ qua request hợp lệ khi đang navigating.
- Geofence và map loop đều có thể phát sinh trigger narration.
- Một số API/DB contract mang tính chuyển tiếp (legacy columns/content).
- Có 2 nhánh admin cùng tồn tại (ASP.NET MVC + React) làm tăng rủi ro lệch trạng thái dữ liệu vận hành.
