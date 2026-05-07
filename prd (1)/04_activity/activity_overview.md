# 4. Activity Overview

## 4.1 High-level System Activity

1. Admin tạo/duyệt POI trên backend.
2. Mobile app khởi động:
   - init localization in-memory,
   - seed/load SQLite core POIs.
3. User vào map:
   - app render pin/radius,
   - chạy tracking location định kỳ.
4. User vào POI theo 2 đường:
   - chủ động: scan QR / tap pin,
   - tự động: geofence trigger.
5. App phát TTS theo ngôn ngữ hiện tại, đồng thời gửi tín hiệu Telemetry về Backend (Intelligence Ingestion).
6. Backend thực hiện Rollup dữ liệu định kỳ (Hourly/Daily) để phục vụ báo cáo Heatmap/Revenue trên Admin Dashboard.
7. Khi có network + auth, mobile sync POIs from backend để cập nhật local.

## 4.2 Activity Boundaries By Subsystem

- **Mobile**: UI flow, local data, geofence, audio, navigation.
- **Backend**: auth, moderation, token scan, POI APIs, Intelligence Rollup.
- **Web admin**: thao tác quản trị người dùng/POI, xem báo cáo Intelligence qua API.

## 4.3 Honest Notes For Diagram Conversion

- Có nhánh điều kiện “suppress” trong geofence/nav để tránh race, nhưng có thể gây skip hành vi mong muốn.
- Map loop hiện đồng thời làm nhiều việc (location update, auto select, auto play), nên activity chi tiết cần thể hiện các checkpoint điều kiện rõ ràng.
