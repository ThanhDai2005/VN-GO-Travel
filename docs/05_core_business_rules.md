# 5. Core Business Rules

## POI
Mỗi POI phải có:
- mã định danh `Code`
- tên
- mô tả
- latitude
- longitude
- bán kính kích hoạt
- mức ưu tiên
- nội dung thuyết minh
- ngôn ngữ

## Trigger Rules
- user chỉ được coi là vào vùng khi khoảng cách `<= radius`
- nếu nhiều POI cùng hợp lệ, chọn theo:
  1. `Priority` cao hơn
  2. khoảng cách gần hơn
- cần có cơ chế chống lặp khi GPS dao động

## Audio Rules
- chỉ phát một audio tại một thời điểm
- không được phát chồng
- manual play được quyền ưu tiên hơn auto trigger
- QR flow không tự động phát nếu chưa chốt rõ luật; mặc định user vào detail rồi bấm nghe

## Offline Rules
- nếu không có mạng vẫn đọc được POI từ SQLite
- nếu không có file audio thì dùng TTS local nếu có
- QR trong app vẫn mở được POI nếu local data đã có

## Language Rules
- ưu tiên ngôn ngữ đang chọn
- fallback theo thứ tự:
  1. ngôn ngữ yêu cầu
  2. `vi`
  3. bất kỳ bản ghi nào còn tồn tại

## QR Rules

### QR Role
- QR là kênh truy cập POI bổ sung, không thay thế geofence
- geofence phục vụ kích hoạt tự động theo vị trí
- QR phục vụ truy cập trực tiếp đúng POI theo mã hoặc liên kết

### QR Input Types (current)
Hệ thống hiện hỗ trợ các loại QR sau (parsed inside app scanner):
1. in-app QR format: `poi:CODE`
2. in-app QR format mở rộng: `poi://CODE`
3. plain code fallback: `CODE`
4. link-based QR inside app scanner:
   - `https://domain/poi/CODE`
   - `https://domain/p/CODE`

### QR Behavior (current)
- `QrResolver.Parse()` chuẩn hóa payload về `Code` (trim, uppercase)
- Sau khi parse thành công, flow dùng chung: `Code -> PoiDatabase -> Poi` -> navigation to `PoiDetailPage`
- Khi scan trong app, mặc định mở `PoiDetailPage`; từ detail user có thể `Open on Map` hoặc play narration
- Parser báo lỗi rõ ràng khi format không hợp lệ hoặc khi code trống
- Nếu `Code` không tồn tại trong local DB, app thông báo POI không khả dụng local

### QR Behavior (notes)
- Parser normalizes code (trim + ToUpperInvariant)
- Parser supports both plain and link-based payloads INSIDE the app scanner. OS-level deep linking and landing page behavior are not implemented here.

### QR and Offline
- nếu user offline và đã có app + dữ liệu POI local, app vẫn có thể mở đúng POI
- nếu user offline nhưng chưa có app, hệ thống không đảm bảo trải nghiệm đầy đủ
- app phải báo rõ khi POI không có local data

### QR and Narration
- sau khi mở POI bằng QR, user có thể bấm nghe narration
- QR trigger không được gây phát chồng với geofence trigger
- nếu đang có audio do geofence phát, manual play từ detail được quyền stop audio cũ rồi phát audio mới

### Error Handling
- nếu QR sai format, báo lỗi hợp lệ
- nếu `Code` không tồn tại, báo POI không khả dụng local
- nếu POI có nhưng thiếu đúng ngôn ngữ, áp dụng language fallback
