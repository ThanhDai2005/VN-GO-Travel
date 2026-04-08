# 8. Test Checklist

## Mục tiêu
Tài liệu này dùng để kiểm tra xem ứng dụng đã đạt mức PoC hay MVP chưa, đồng thời giúp tránh việc sửa bug lặp đi lặp lại mà không có tiêu chí rõ ràng.

---

## 1. Startup Tests

### 1.1. App launch
- [ ] App khởi động thành công
- [ ] Không crash khi vào trang chính
- [ ] `pois.json` được load thành công

### 1.2. Initial data
- [ ] Danh sách POI xuất hiện đúng
- [ ] Không bị trùng dữ liệu bất thường
- [ ] Mỗi POI có đủ các trường cần thiết

### 1.3. Initial location
- [ ] App xin quyền vị trí đúng cách
- [ ] Lấy được vị trí hiện tại
- [ ] Có xử lý khi user từ chối quyền vị trí

---

## 2. POI Data Tests

### 2.1. Data format
- [ ] Mỗi POI có `Code`
- [ ] Mỗi POI có `Latitude`, `Longitude`
- [ ] Mỗi POI có `Radius`
- [ ] Mỗi POI có `Priority`
- [ ] Mỗi POI có `LanguageCode`
- [ ] Mỗi POI có `Name`
- [ ] Mỗi POI có `NarrationShort`
- [ ] Mỗi POI có `NarrationLong`

### 2.2. Multi-language consistency
- [ ] Cùng một `Code` có thể tồn tại nhiều ngôn ngữ
- [ ] Dữ liệu tiếng Việt và tiếng Anh của cùng một POI khớp nhau về tọa độ/radius/priority
- [ ] Không bị sai lệch `Code` giữa các bản dịch

### 2.3. Data lookup
- [ ] Tìm đúng POI theo `Code`
- [ ] Lấy đúng bản dịch theo `LanguageCode`
- [ ] Nếu thiếu ngôn ngữ, có rule fallback rõ ràng

---

## 3. GPS / Location Tests

### 3.1. Current location
- [ ] App hiển thị được vị trí hiện tại
- [ ] Vị trí cập nhật khi người dùng di chuyển

### 3.2. Permission handling
- [ ] Nếu chưa cấp quyền, app yêu cầu đúng
- [ ] Nếu từ chối quyền, app không crash
- [ ] Có thông báo/luồng thay thế khi không có GPS

### 3.3. Stability
- [ ] GPS không gây lag UI rõ rệt
- [ ] Không update vô hạn làm app nóng máy bất thường

---

## 4. Geofence Tests

### 4.1. Distance check
- [ ] Khi user ở ngoài bán kính, POI không trigger
- [ ] Khi user vào trong bán kính, POI được xét trigger

### 4.2. Multiple POIs
- [ ] Nếu nhiều POI hợp lệ, app chọn đúng POI ưu tiên cao hơn
- [ ] Nếu priority bằng nhau, app chọn POI gần hơn

### 4.3. Repeat trigger control
- [ ] Một POI đã phát rồi không bị phát lặp ngay lập tức
- [ ] Cooldown hoạt động đúng nếu đã được cài
- [ ] Debounce hoạt động đúng nếu đã được cài

### 4.4. Business behavior
- [ ] Trigger geofence đúng với rule trong `05_core_business_rules.md`
- [ ] Không có hành vi trái với rule đã ghi trong docs

---

## 5. Narration / Audio Tests

### 5.1. Basic playback
- [ ] Khi trigger thành công, app phát narration
- [ ] Narration dùng đúng nội dung của POI
- [ ] Không crash khi phát audio / TTS

### 5.2. Playback policy
- [ ] Chỉ phát một audio tại một thời điểm
- [ ] Không bị chồng nhiều audio
- [ ] Auto geofence không phá manual play
- [ ] Manual play từ detail stop được audio cũ rồi phát mới

### 5.3. Content choice
- [ ] `NarrationShort` được dùng cho auto play
- [ ] `NarrationLong` được dùng cho detailed play nếu có
- [ ] Rule chọn short/long được áp dụng nhất quán

### 5.4. Language
- [ ] Phát đúng ngôn ngữ đang chọn
- [ ] Không bị lấy nhầm narration của ngôn ngữ khác

---

## 6. Map UI Tests

### 6.1. Map rendering
- [ ] Bản đồ hiển thị bình thường
- [ ] POI hiển thị trên bản đồ
- [ ] Vị trí user hiển thị trên bản đồ

### 6.2. POI interaction
- [ ] Chạm vào POI xem được thông tin
- [ ] POI gần nhất có thể được highlight nếu đã cài

### 6.3. UI stability
- [ ] MapPage không bị lag nặng khi cập nhật vị trí
- [ ] Không phát sinh lỗi hiển thị bất thường khi refresh dữ liệu

---

## 7. Offline Tests

### 7.1. Local data
- [ ] App vẫn đọc được POI từ local data khi không có mạng
- [ ] Không phụ thuộc server cho luồng PoC cơ bản

### 7.2. Narration fallback
- [ ] Nếu không có audio file, app vẫn có thể dùng TTS local
- [ ] Không vì mất mạng mà mất hoàn toàn khả năng thuyết minh cơ bản

---

## 8. QR Code Tests

### 8.1. Parser formats (current)
- [ ] App parse được `poi:HO_GUOM`
- [ ] App parse được `poi://HO_GUOM`
- [ ] App parse được `HO_GUOM`
- [ ] App parse được URL payloads: `https://domain/p/HO_GUOM` và `https://domain/poi/HO_GUOM` khi quét trong app scanner
- [ ] App báo lỗi đúng với QR sai format
- [ ] Đảm bảo parse order: `poi://` được kiểm tra trước `poi:`

### 8.2. QR to POI resolution
- [ ] Scan xong mở đúng POI detail
- [ ] Không cần GPS vẫn mở được đúng POI
- [ ] Nếu `Code` không tồn tại, app báo đúng lỗi

### 8.3. QR and local data
- [ ] Nếu dữ liệu POI đã có local, QR vẫn mở được khi offline
- [ ] Nếu chưa có local data và đang offline, app báo rõ tình trạng thiếu dữ liệu

### 8.4. Link-based QR (notes)
- [ ] Parser inside scanner nhận diện URL path `/p/{CODE}` và `/poi/{CODE}`
- [ ] OS-level app link behavior is NOT implemented: verify deep-link behavior is planned only
- [ ] Landing page / external flow are out of scope for current tests

### 8.5. External camera scenario (future)
- External device camera -> OS deep link is not implemented. Add these tests in future phases when deep link handler and intent-filters are added.

### 8.6. QR and narration
- [ ] Từ POI detail sau khi scan, user có thể bấm nghe narration
- [ ] QR không gây phát chồng với geofence nếu đang ở gần POI

### 8.7. Navigation stability
- [ ] Scan không push dư page bất thường (verify double navigation prevention)
- [ ] Từ detail bấm Open on Map không bị kẹt flow
- [ ] Map focus đúng POI sau khi mở từ detail

### 8.8. Offline no-app scenario
- [ ] Nếu user không có app và đang offline, hệ thống xử lý rõ ràng
- [ ] Nếu không thể phát audio ngay, phải có thông báo hoặc fallback hợp lý

---

## 9. Regression Tests

### 9.1. Sau mỗi lần refactor
- [ ] App vẫn mở được
- [ ] Map vẫn hiện
- [ ] GPS vẫn hoạt động
- [ ] Geofence vẫn trigger
- [ ] Narration vẫn phát
- [ ] QR vẫn mở đúng detail
- [ ] Không sinh ra bug cũ

### 9.2. Đối chiếu docs
- [ ] Code hiện tại khớp với `04_mvp_scope.md`
- [ ] Code hiện tại khớp với `05_core_business_rules.md`
- [ ] Code hiện tại khớp với `06_simple_architecture.md`
- [ ] Code hiện tại khớp với `09_qr_strategy.md`

---

## 10. Done Definition

### PoC được coi là xong khi:
- [ ] App load được POI
- [ ] App lấy được GPS
- [ ] App xác định được POI gần
- [ ] App phát được narration
- [ ] App không phát lặp liên tục
- [ ] App scan được QR trong app

### MVP QR được coi là xong khi:
- [ ] Có parser QR ổn định
- [ ] Có scan -> detail flow ổn định
- [ ] Có open on map ổn định
- [ ] Có rule audio không chồng
- [ ] Có chuẩn bị link-based QR rõ ràng
- [ ] Có checklist test đạt mức chấp nhận được
