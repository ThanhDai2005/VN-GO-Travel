# 5.4 Sequence - Owner Submission & Moderation

Sơ đồ này mô tả quy trình từ lúc một Owner gửi đề xuất địa điểm mới cho đến khi Admin phê duyệt hoặc từ chối.

## Các thành phần tham gia (Participants)
- **POI Owner**: Người dùng có quyền chủ địa điểm, gửi đề xuất.
- **Admin**: Quản trị viên hệ thống, thực hiện kiểm duyệt.
- **Owner/Admin Dashboard**: Giao diện Web (React) dùng để gửi và duyệt.
- **Backend API**: Xử lý logic nghiệp vụ và phân quyền.
- **MongoDB**: Cơ sở dữ liệu lưu trữ trạng thái POI và nhật ký (Audit).

## Quy trình chi tiết (Main Sequence)

1. **Gửi đề xuất**: Owner điền thông tin (Tên, tọa độ, mô tả, hình ảnh) và gửi qua Dashboard.
2. **Khởi tạo**: Dashboard gọi `POST /api/owner/submissions`.
3. **Lưu tạm**: Backend tạo bản ghi POI trong MongoDB với trạng thái **PENDING**.
4. **Thông báo**: Backend trả về phản hồi "Báo cáo nộp thành công".
5. **Kiểm duyệt**: Admin truy cập danh sách chờ duyệt qua `GET /api/admin/pois/change-requests`.
6. **Xem xét**: Admin xem thông tin chi tiết và đưa ra quyết định:
   - **Trường hợp CHẤP NHẬN (Approve)**:
     - Gọi `POST /id/approve`.
     - Backend thực hiện **Transaction Atomic** (Giao dịch nguyên tử):
       - Cập nhật/Tạo bản ghi chính thức trong bộ sưu tập POIs Master.
       - Đổi trạng thái yêu cầu thành **APPROVED**.
       - Ghi log vào bộ sưu tập **Audits** để truy vết.
   - **Trường hợp TỪ CHỐI (Reject)**:
     - Gọi `POST /id/reject` kèm lý do.
     - Đổi trạng thái yêu cầu thành **REJECTED** và lưu lý do.
     - Ghi log vào bộ sưu tập **Audits**.
7. **Phản hồi**: Hệ thống thông báo kết quả cho Owner và cập nhật dữ liệu lên ứng dụng di động.

## Đặc điểm kỹ thuật
- **Atomic Transaction**: Đảm bảo việc duyệt POI và ghi log audit luôn đi đôi với nhau, tránh sai lệch dữ liệu.
- **Cache Invalidation**: Sau khi duyệt, bộ nhớ đệm (Cache) sẽ được xóa để người dùng thấy dữ liệu mới ngay lập tức.
