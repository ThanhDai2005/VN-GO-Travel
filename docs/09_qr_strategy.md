# 9. QR Strategy

> **Runtime contract (frozen):** `docs/QR_MODULE.md` — các URL `your-domain` trong tài liệu này là lịch sử.

## Mục tiêu
Tài liệu này mô tả vai trò của QR code trong hệ thống, các tình huống sử dụng thực tế, trạng thái hiện tại của code, và chiến lược triển khai theo từng giai đoạn.

---

## 1. Vai trò của QR code

QR code là một kênh truy cập POI bổ sung bên cạnh geofence.

- geofence: tự động kích hoạt theo vị trí
- QR: truy cập trực tiếp đúng POI theo mã hoặc liên kết

QR đặc biệt hữu ích khi:
- GPS không chính xác
- người dùng đứng trong nhà
- nhiều POI quá gần nhau
- người dùng muốn chủ động mở đúng POI

---

## 2. Trạng thái hiện tại trong code

### Đã có
- `QrScannerPage`: lifecycle camera, permission, detect barcode, chống xử lý trùng cơ bản
- `QrScannerViewModel`: parse payload, lookup local DB, điều hướng tới detail
- `QrResolver`: parse `poi:CODE`, `poi://CODE`, hoặc plain code
- `PoiDetailPage`: user nghe narration hoặc mở lại trên map
- `PoiDatabase.GetByCodeAsync()`: tra POI theo `Code` + fallback ngôn ngữ

### Chưa có
- parser URL QR trong code
- `DeepLinkHandler`
- Android app link / universal link
- landing page
- external camera end-to-end flow

### Vấn đề hiện biết
- `QrResolver` cần sửa thứ tự parse `poi://` trước `poi:`
- docs cũ phải được cập nhật để phản ánh trạng thái “đã có in-app QR flow”

---

## 3. Các tình huống sử dụng chính

### Tình huống 1: User đã có app và scan trong app
1. user mở scanner
2. app đọc QR
3. parse ra `Code`
4. lookup local DB
5. mở `PoiDetailPage`
6. user bấm nghe narration hoặc mở map

### Tình huống 2: User đã có app nhưng scan bằng camera thiết bị
1. QR là link `https://your-domain/p/CODE`
2. thiết bị mở link
3. app link / universal link chuyển vào app
4. app parse `Code`
5. app mở đúng POI

### Tình huống 3: User chưa có app
1. user scan bằng camera thiết bị
2. QR mở landing page
3. landing page cho xem info ngắn + hướng dẫn tải app
4. sau khi cài app, user có thể mở lại đúng POI

### Tình huống 4: User offline và đã có app
- nếu dữ liệu local đã có, app vẫn mở được đúng POI
- narration có thể dùng TTS local

### Tình huống 5: User offline và chưa có app
- không đảm bảo trải nghiệm đầy đủ
- hệ thống chỉ nên hiển thị fallback rõ ràng nếu có

---

## 4. Định dạng QR

## Supported formats (current)
In-app scanner parses and normalizes the following payloads:
- `poi:CODE`
- `poi://CODE`
- `CODE` (plain)
- `https://domain/p/CODE` and `https://domain/poi/CODE` when scanned inside the app scanner (parsed from AbsolutePath segments)

## Target / Future (OS-level)
- OS-level app links (universal links / intent filters) remain a future step; when implemented they will reuse the same parser and `Code -> POI` flow.

---

## 5. Luồng xử lý hiện tại

### In-app scanner flow hiện tại
1. user mở chức năng quét QR trong app
2. `QrScannerPage` xin quyền camera và bật detector
3. camera đọc ra chuỗi QR
4. `QrScannerViewModel` gọi `QrResolver.Parse()`
5. parser trích xuất `Code`
6. `PoiDatabase.GetByCodeAsync()` tra POI local
7. nếu có dữ liệu -> mở `PoiDetailPage`
8. user bấm nghe narration hoặc mở map

### Đặc điểm của flow hiện tại
- ổn cho PoC/MVP cơ bản
- ít phá app hiện có
- chưa giải quyết external camera scenario

---

## 6. Luồng xử lý mục tiêu

### External camera flow target
1. user scan bằng camera thiết bị
2. thiết bị mở URL trong QR
3. nếu app đã cài:
   - app link mở app vào đúng POI
4. nếu app chưa cài:
   - landing page hiện thông tin ngắn
   - hướng dẫn tải app
5. sau khi vào app, dùng chung `Code -> POI`

### In-app scanner flow target
1. app scanner scan được cả text QR và link QR
2. parser chuẩn hóa payload về `Code`
3. dùng chung lookup local DB
4. mở detail trước, map sau
5. manual narration tuân theo audio policy

---

## 7. Quy tắc dữ liệu

- không bắt buộc lưu sẵn ảnh QR trong mỗi POI
- `Code` là khóa định danh đủ để tạo và xử lý QR
- ảnh QR có thể sinh riêng khi cần in ấn, quảng bá hoặc demo
- dữ liệu POI hiện tại đã đủ để hỗ trợ QR cơ bản

---

## 8. Các trường hợp lỗi cần tính tới

- QR sai format
- QR đúng format nhưng thiếu `Code`
- `Code` không tồn tại trong dữ liệu
- user offline và chưa có dữ liệu POI local
- user có app nhưng deep link không mở đúng
- QR mở POI nhưng narration không khả dụng
- QR và geofence cùng trigger gần như đồng thời
- navigation bị push page dư hoặc focus map sai

---

## 9. Chiến lược triển khai

### Phase 1 — stabilize current flow
- sửa bug parser `poi://`
- giữ scan -> detail flow
- hoàn tất test manual narration + open on map

### Phase 2 — support link payload in parser
- parser đọc được URL QR
- vẫn resolve về `Code`
- scanner trong app dùng được cả link QR

### Phase 3 — add deep link entry
- thêm app link / deep link handler
- app mở đúng POI từ URL ngoài

### Phase 4 — landing page / external flow
- trang trung gian cho user chưa có app
- hướng dẫn tải app
- fallback rõ ràng

---

## 10. Kết luận
Trong giai đoạn hiện tại, QR nên được triển khai theo hướng đơn giản nhưng mở rộng được:

- lõi dữ liệu vẫn dùng `Code`
- trước mắt ưu tiên ổn định scan trong app
- docs phải phản ánh đúng trạng thái hiện tại
- kiến trúc phải sẵn sàng cho link-based QR mà không phá flow đang chạy
