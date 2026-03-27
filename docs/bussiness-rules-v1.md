# Đặc tả Quy tắc Nghiệp vụ (Business Rules) v1.0
**Dự án:** Location-based Narration App
**Module:** Core Geofence & Audio Engine

## 1. Thuật ngữ (Glossary)
* **POI (Point of Interest):** Điểm tham quan có tọa độ (Lat/Lng) và bán kính (Radius).
* **Tick:** Một chu kỳ quét vị trí và xử lý logic của hệ thống.
* **Hysteresis Threshold:** Khoảng đệm (Radius * 1.2) giúp tránh thiết bị nhảy trigger liên tục do nhiễu sóng GPS.

## 2. Quy tắc Geofence (GEO)
* **[BR-GEO-01] Chu kỳ quét:** Lấy tọa độ GPS định kỳ (Áp dụng Dynamic Interval: tự động tăng giảm tần suất dựa trên khoảng cách đến POI gần nhất).
* **[BR-GEO-02] Điều kiện Trigger:** Điểm thiết bị cách tâm POI <= Radius.
* **[BR-GEO-03] Xử lý xung đột:** Nếu thiết bị nằm trong nhiều POI cùng lúc -> Chọn 1 POI duy nhất theo ưu tiên: `Priority` cao nhất -> Khoảng cách gần nhất.
* **[BR-GEO-04] Chống lặp (Retrigger):** POI đã phát chỉ được reset trạng thái khi thiết bị đi ra xa khỏi mức `Radius * 1.2`.

## 3. Quy tắc Audio (AUD)
* **[BR-AUD-01] Đơn luồng:** Chỉ phát tối đa 01 luồng âm thanh tại một thời điểm.
* **[BR-AUD-02] Ưu tiên phát:**
  * *Auto (Geofence):* Bỏ qua (Skip) sự kiện nếu hệ thống đang bận phát một audio khác.
  * *Manual (Click):* Ngắt (Cancel) audio hiện tại và phát ngay lập tức audio của người dùng vừa chọn.

## 4. Quy tắc Nội dung & Ngôn ngữ (LOC)
* **[BR-LOC-01] Nguồn phát:** Ưu tiên đọc `NarrationShort`. Nếu null/rỗng -> fallback đọc `Name`.
* **[BR-LOC-02] Fallback Ngôn ngữ:** Ưu tiên theo thứ tự: Ngôn ngữ thiết bị (Device Culture) -> `vi` -> `en` -> Bản ghi đầu tiên tồn tại trong DB.