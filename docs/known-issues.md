# Known Issues / Giới hạn hiện tại

Tài liệu này liệt kê các điểm chưa hoàn thiện theo đúng hiện trạng MVP.

## 1) Dữ liệu và ngôn ngữ

- Nguồn dữ liệu gốc `pois.json` hiện chủ yếu là tiếng Việt.
- Một số ngôn ngữ hoạt động theo fallback hoặc dịch động, chưa có nội dung biên tập thủ công đầy đủ.
- Chất lượng bản dịch tự động phụ thuộc provider và điều kiện mạng.

## 2) SQLite và mô hình dữ liệu

- DB local đang lưu 1 dòng lõi cho mỗi POI (`Code`, tọa độ, radius, priority).
- Text hiển thị không lấy trực tiếp từ bảng `pois` mà lấy từ `LocalizationService` (memory lookup từ JSON/cache).
- Có các cột migration cũ trong SQLite để tương thích phiên bản trước; không dùng làm nguồn chính cho UI hiện tại.

## 3) QR / Deep link

- QR hỗ trợ các format đã định nghĩa (`poi:CODE`, `poi://CODE`, URL `/poi/{CODE}`, `/p/{CODE}`, plain code).
- Nếu mã hợp lệ nhưng không có trong DB local, app báo không tìm thấy POI.
- Deep link hiện tập trung cho Android warm intent; các nền tảng khác chưa có đầy đủ cùng mức hoàn thiện.

## 4) GPS / geofence / audio

- Geofence dùng polling 5 giây + cooldown; có thể trễ nhẹ khi di chuyển nhanh.
- Chất lượng định vị phụ thuộc thiết bị và quyền vị trí.
- TTS phụ thuộc engine của hệ điều hành; voice có thể khác giữa thiết bị.

## 5) Vận hành và kiểm thử

- Chưa có bộ test tự động toàn diện cho các luồng chính.
- Logging `Debug.WriteLine` còn nhiều vì phục vụ giai đoạn ổn định MVP.
- Chưa có pipeline đồng bộ dữ liệu nội dung giữa app và hệ quản trị.

## 6) Trade-off đã chấp nhận ở MVP

- Ưu tiên app chạy ổn định offline local-first.
- Chấp nhận giới hạn đồng bộ và mức hoàn thiện đa ngôn ngữ để kịp tiến độ.
- Tối ưu “đủ dùng để demo kỹ thuật” thay vì hoàn thiện sản phẩm production.
