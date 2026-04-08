# Đặc tả Quy tắc Nghiệp vụ (Business Rules) v1.0

**Dự án:** Location-based Narration App  
**Module:** Core Geofence & Audio Engine

## 1. Thuật ngữ (Glossary)
- **POI (Point of Interest):** Điểm tham quan có tọa độ (Lat/Lng) và bán kính (Radius).
- **Tick:** Một chu kỳ quét vị trí và xử lý logic của hệ thống.
- **Hysteresis Threshold:** Khoảng đệm `Radius * 1.2` giúp tránh thiết bị nhảy trigger liên tục do nhiễu GPS.

## 2. Quy tắc Geofence (GEO)
- **[BR-GEO-01] Chu kỳ quét:** Lấy tọa độ GPS định kỳ. Có thể mở rộng sang dynamic interval sau.
- **[BR-GEO-02] Điều kiện Trigger:** Điểm thiết bị cách tâm POI `<= Radius`.
- **[BR-GEO-03] Xử lý xung đột:** Nếu thiết bị nằm trong nhiều POI cùng lúc, chọn 1 POI duy nhất theo ưu tiên:
  1. `Priority` cao nhất
  2. khoảng cách gần nhất
- **[BR-GEO-04] Chống lặp (Retrigger):** POI đã phát chỉ được reset trạng thái khi thiết bị đi ra xa khỏi mức `Radius * 1.2`.

## 3. Quy tắc Audio (AUD)
- **[BR-AUD-01] Đơn luồng:** Chỉ phát tối đa 01 luồng âm thanh tại một thời điểm.
- **[BR-AUD-02] Ưu tiên phát:**
  - **Auto (Geofence):** bỏ qua sự kiện nếu hệ thống đang bận phát một audio khác.
  - **Manual (Click từ detail):** ngắt audio hiện tại và phát ngay nội dung người dùng vừa chọn.
- **[BR-AUD-03] QR Policy:** scan QR không tự autoplay nếu chưa chốt rule riêng; mặc định mở detail trước.

## 4. Quy tắc Nội dung & Ngôn ngữ (LOC)
- **[BR-LOC-01] Nguồn phát auto:** ưu tiên `NarrationShort`. Nếu rỗng -> fallback `Name`.
- **[BR-LOC-02] Nguồn phát manual:** ưu tiên `NarrationLong`. Nếu rỗng -> fallback `NarrationShort` -> `Name`.
- **[BR-LOC-03] Fallback ngôn ngữ:** thứ tự:
  1. ngôn ngữ yêu cầu
  2. `vi`
  3. bản ghi đầu tiên tồn tại trong DB

## 5. Quy tắc QR (QR)
- **[BR-QR-01] Vai trò:** QR là luồng truy cập trực tiếp POI, không thay thế geofence.
- **[BR-QR-02] Parser:** mọi payload QR hợp lệ phải được chuẩn hóa về `Code`.
- **[BR-QR-03] Điều hướng:** scan thành công -> mở `PoiDetailPage` trước.
- **[BR-QR-04] Offline:** nếu local data đã có thì QR vẫn mở được POI khi offline.
- **[BR-QR-05] Link target:** về sau QR public nên dùng URL thay vì text thô để hỗ trợ external camera flow.
