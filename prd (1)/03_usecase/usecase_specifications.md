# 3. Use Case Specifications

## UC-M1: View Map And Nearby POIs
- **Actor**: Tourist/User
- **Description**: Người dùng mở bản đồ, hệ thống tải POI local và render pin/radius.
- **Main Flow**:
  1. User mở Map.
  2. App load POIs từ SQLite local.
  3. Hệ thống hiển thị các POI trong khu vực.
- **Postconditions**: Bản đồ hiển thị đầy đủ các điểm tham quan.

## UC-M2: Scan QR To Open POI
- **Actor**: Tourist/User
- **Description**: Quét QR để mở nhanh thông tin địa danh (Không giới hạn lượt quét).
- **Main Flow**:
  1. User quét mã QR tại điểm đến.
  2. App parse mã và gọi API xác thực.
  3. Mở trang chi tiết địa danh ngay lập tức.
- **Alternative Flows**: Nếu mã QR thuộc Zone chưa mua, App vẫn mở trang chi tiết nhưng chỉ cho phép nghe "Nghe tóm tắt".

## UC-M4: Listen Narration (Short/Long)
- **Actor**: Tourist/User
- **Description**: Nghe thuyết minh. Phân tầng nội dung theo quyền sở hữu Zone Pass.
- **Main Flow**:
  1. User nhấn "Nghe tóm tắt": App phát đoạn NarrationShort (Miễn phí cho mọi người).
  2. Nếu User đã sở hữu Zone Pass (Quyền truy cập khu vực): Nút "Nghe chi tiết" xuất hiện.
  3. User nhấn "Nghe chi tiết": App phát đoạn NarrationLong chuyên sâu.
- **Alternative Flows**: Nếu chưa sở hữu, frame "Mua Zone Pass" sẽ hiển thị để mời người dùng mua quyền truy cập.

## UC-M6: Purchase Zone Pass
- **Actor**: Tourist/User
- **Description**: Mua quyền truy cập trọn đời (Zone Pass) cho một Tour du lịch hoặc khu vực.
- **Main Flow**:
  1. User chọn Zone muốn mua trên ứng dụng.
  2. Hệ thống kiểm tra số dư và trừ Credits trong ví.
  3. Ghi nhận quyền sở hữu vào MongoDB và đồng bộ xuống SQLite mobile.
  4. Mở khóa toàn bộ NarrationLong của các POI thuộc Zone đó.
- **Postconditions**: Người dùng có thể nghe chi tiết mọi POI trong Zone vĩnh viễn.

## UC-W4: Intelligence Dashboard
- **Actor**: Admin, Owner
- **Description**: Xem bản đồ nhiệt (Heatmap) và thống kê doanh thu.
- **Main Flow**:
  1. Admin xem mật độ khách tham quan qua Heatmap.
  2. Hệ thống tổng hợp dữ liệu từ Intelligence Ingestion.
  3. Hiển thị biểu đồ tăng trưởng Tour và doanh thu thực tế từ việc bán Zone Pass.
