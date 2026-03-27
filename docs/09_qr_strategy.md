# 9. QR Strategy

## Mục tiêu
Tài liệu này mô tả vai trò của QR code trong hệ thống, các tình huống sử dụng thực tế, và chiến lược triển khai theo từng giai đoạn.

---

## 1. Vai trò của QR code

QR code là một kênh truy cập POI bổ sung bên cạnh geofence.

- Geofence: tự động kích hoạt theo vị trí
- QR: truy cập trực tiếp đúng POI theo mã hoặc liên kết

QR đặc biệt hữu ích khi:
- GPS không chính xác
- người dùng đứng trong nhà
- nhiều POI quá gần nhau
- người dùng muốn chủ động mở đúng POI

---

## 2. Các tình huống sử dụng chính

### Tình huống 1: User chưa có app
- User scan QR bằng camera thiết bị
- QR mở link trung gian
- Nếu app chưa cài, hệ thống hướng user tải app
- Sau khi cài app, user có thể mở lại đúng POI

### Tình huống 2: User đã có app nhưng scan bằng camera thiết bị
- QR mở link-based deep link
- Hệ thống mở app vào đúng POI
- Nếu fail, fallback sang landing page

### Tình huống 3: User đã có app và scan trong app
- App scanner đọc QR
- Parse `Code`
- Mở đúng POI detail
- User nghe narration

### Tình huống 4: User offline và chưa có app
- Hệ thống không đảm bảo nghe audio đầy đủ
- Có thể chỉ cung cấp thông tin ngắn hoặc thông báo hướng dẫn
- Trải nghiệm đầy đủ cần có app hoặc có mạng

### Tình huống 5: User offline nhưng đã có app
- Nếu dữ liệu POI đã có local, app vẫn mở được đúng POI
- Nếu narration local hoặc TTS local khả dụng, vẫn có thể phát nội dung

---

## 3. Định dạng QR

## Giai đoạn đầu
Hỗ trợ dạng:
`poi:CODE`

Ví dụ:
`poi:HO_TAY`

## Giai đoạn mở rộng
Hỗ trợ dạng:
`https://your-domain/poi/HO_TAY`

Dạng link phù hợp hơn cho:
- camera thiết bị
- mở app từ bên ngoài
- landing page
- tải app

---

## 4. Luồng xử lý đề xuất

### In-app scanner flow
1. User mở chức năng quét QR trong app
2. App scan ra chuỗi QR
3. Parse QR
4. Trích xuất `Code`
5. Tìm POI theo `Code`
6. Mở `PoiDetailPage`
7. User bấm nghe narration hoặc app phát theo rule

### External camera flow
1. User scan bằng camera thiết bị
2. Thiết bị mở link trong QR
3. Nếu app đã cài và deep link hoạt động:
   - mở app tới đúng POI
4. Nếu chưa có app:
   - mở landing page
   - hướng dẫn cài app

---

## 5. Quy tắc dữ liệu

- Không bắt buộc lưu sẵn ảnh QR trong mỗi POI
- `Code` là khóa định danh đủ để tạo và xử lý QR
- Ảnh QR có thể được sinh riêng khi cần in ấn, quảng bá hoặc demo
- Dữ liệu POI hiện tại đã đủ để hỗ trợ QR cơ bản

---

## 6. Các trường hợp lỗi cần tính tới

- QR sai format
- QR đúng format nhưng thiếu `Code`
- `Code` không tồn tại trong dữ liệu
- user offline và chưa có dữ liệu POI local
- user có app nhưng deep link không mở đúng
- QR mở POI nhưng narration không khả dụng
- QR và geofence cùng trigger gần như đồng thời

---

## 7. Chiến lược triển khai

### Phase 1
- Chỉ làm in-app scanner
- Hỗ trợ `poi:CODE`
- Mở đúng POI detail

### Phase 2
- Hỗ trợ QR dạng link
- Chuẩn bị deep link / app link
- Hỗ trợ camera thiết bị

### Phase 3
- Landing page cho user chưa có app
- Xem xét deferred deep linking
- Bổ sung analytics QR nếu cần

---

## 8. Kết luận

Trong giai đoạn hiện tại, QR nên được triển khai theo hướng đơn giản nhưng mở rộng được:
- lõi dữ liệu vẫn dùng `Code`
- chưa cần lưu ảnh QR trong model
- trước mắt ưu tiên scan trong app
- đồng thời tài liệu phải chuẩn bị sẵn hướng link-based QR cho các tình huống thực tế hơn