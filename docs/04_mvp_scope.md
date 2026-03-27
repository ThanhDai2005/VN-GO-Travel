# 4. MVP Scope

## Objective
Biến PoC thành một ứng dụng cơ bản có thể demo ổn định.

## MVP Features
- Map hiển thị vị trí user
- Hiển thị tất cả POI
- Highlight POI gần nhất
- Xem chi tiết POI
- TTS hoặc audio file
- SQLite lưu dữ liệu offline
- Hỗ trợ ít nhất 2 ngôn ngữ
- Debounce + cooldown
- Không phát audio chồng nhau
- Quét QR để mở POI hoặc kích hoạt thuyết minh

## Deferred Features
- CMS web
- AI services
- analytics
- owner/admin portal

## Done Definition cho MVP
- hiển thị map ổn định
- POI load từ SQLite
- chọn ngôn ngữ được
- geofence có debounce/cooldown
- không phát chồng tiếng
- xem chi tiết POI
- QR scan mở đúng POI
- offline cơ bản dùng được

## QR Code in MVP
QR code là một kênh truy cập POI bổ sung bên cạnh geofence.

MVP QR cần hỗ trợ:
- scan QR trong app để mở đúng POI
- hỗ trợ link-based QR để camera thiết bị cũng có thể mở được app hoặc mở trang trung gian
- nếu user chưa có app, QR cần có hướng dẫn tải app
- nếu user đã có app, QR cần có khả năng mở đúng POI trong app

Chưa bắt buộc trong MVP:
- deferred deep linking hoàn chỉnh
- analytics QR nâng cao
- offline audio cho người chưa có app