# 5. Core Business Rules

## POI
Mỗi POI phải có:
- mã định danh
- tên
- mô tả
- latitude
- longitude
- bán kính kích hoạt
- mức ưu tiên
- nội dung thuyết minh
- ngôn ngữ

## Trigger Rules
- User chỉ được coi là vào vùng khi khoảng cách <= radius
- Có thể dùng debounce để tránh GPS nhiễu
- Sau khi đã phát thì POI đó vào cooldown

## Audio Rules
- Chỉ phát một audio tại một thời điểm
- Nếu đang phát audio khác thì không phát chồng
- Có thể hàng chờ hoặc bỏ qua theo luật ưu tiên

## Offline Rules
- Nếu không có mạng vẫn đọc được POI từ SQLite
- Nếu không có file audio thì dùng TTS local nếu có

## QR Rules

### QR Role
- QR là kênh truy cập POI bổ sung, không thay thế geofence
- Geofence phục vụ kích hoạt tự động theo vị trí
- QR phục vụ truy cập trực tiếp đúng POI theo mã hoặc liên kết

### QR Input Types
Hệ thống có thể hỗ trợ 2 loại QR:
1. In-app QR format: `poi:CODE`
2. Link-based QR format: `https://your-domain/poi/CODE`

### QR Behavior
- Nếu QR chứa `poi:CODE`, app scanner trong ứng dụng phải parse được `Code`
- Nếu QR chứa link HTTP, hệ thống nên hỗ trợ mở app hoặc mở landing page
- Nếu user đã có app, QR nên dẫn tới đúng POI trong app
- Nếu user chưa có app, QR nên dẫn tới trang trung gian để tải app

### QR and Offline
- Nếu user offline và đã có app + dữ liệu POI đã tồn tại local, app vẫn có thể mở đúng POI
- Nếu user offline nhưng chưa có app, hệ thống không đảm bảo trải nghiệm nghe audio đầy đủ
- Có thể hỗ trợ hiển thị thông tin ngắn hoặc thông báo hướng dẫn tải app khi có mạng

### QR and Narration
- Sau khi mở POI bằng QR, user có thể bấm nghe narration
- QR trigger không được gây phát chồng với geofence trigger
- Nếu cùng lúc QR và geofence cùng trỏ tới một POI, hệ thống phải ưu tiên một luồng narration duy nhất

### Error Handling
- Nếu QR sai format, báo lỗi hợp lệ
- Nếu `Code` không tồn tại, báo POI không khả dụng
- Nếu POI có nhưng thiếu đúng ngôn ngữ, áp dụng language fallback