# 4. Activity - QR Scan

## Scope
- Từ lúc scanner nhận input đến khi điều hướng thành công hoặc báo lỗi.

## Step-by-step Activity

1. User mở scanner trên ứng dụng di động.
2. Scanner nhận chuỗi QR (Camera hoặc Nhập tay).
3. Coordinator parse input (Static Code hoặc Secure Token).
4. Hệ thống xác thực mã QR bảo mật qua Backend (nếu là Secure Token).
5. Kiểm tra quyền sở hữu Zone Pass của người dùng đối với POI này.
6. Mở trang chi tiết POI (`PoiDetailPage`).
7. **Decision**: Người dùng đã sở hữu Zone Pass (Quyền truy cập khu vực)?
   - **Yes**: 
     - Hiển thị đầy đủ thông tin.
     - Cho phép nhấn "Nghe tóm tắt" (Short) và "Nghe chi tiết" (Long).
     - Hide frame mời mua (Purchase Frame).
   - **No**:
     - Hiển thị thông tin cơ bản.
     - Cho phép nhấn "Nghe tóm tắt" (Short).
     - Hiển thị frame mời mua Zone Pass (Purchase Frame) với giá niêm yết.
     - Nút "Nghe chi tiết" (Long) bị ẩn hoặc bị khóa.

## Key Decisions/Conditions
- Loại bỏ hoàn toàn kiểm tra giới hạn lượt quét (QR scanning is UNLIMITED).
- Mọi người dùng đều có thể quét QR để truy cập thông tin cơ bản và nghe tóm tắt miễn phí.
- Quyền nghe chi tiết gắn liền với việc sở hữu Zone Pass của khu vực chứa POI đó.
