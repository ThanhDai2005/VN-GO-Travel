# Sequence - Owner POI Submission & Review Flow

## Participants
- **Actor**: POI Owner (Business Owner)
- **Actor**: Admin
- **Frontend**: Owner Web Dashboard, Admin Web Dashboard
- **Backend**: Express API (`owner.routes.js`, `poi-request.routes.js`, `admin-poi.routes.js`)
- **Database**: MongoDB (POIs, POI Requests, Audits)

## Main Sequences

### 1. Owner Submit Mới/Thay Đổi POI
1. Owner đăng nhập và truy cập `SubmitPoiPage`.

> *Vị trí: `SubmitPoiPage` nằm ở file `admin-web/src/pages/SubmitPoiPage.jsx`, dòng `4`*
2. Owner điền form thông tin (Tên, Tọa độ, Nội dung thuyết minh, Hình ảnh, Priority).
3. Frontend gọi `POST /api/owner/submissions`.

> *Vị trí: `POST /api/owner/submissions` nằm ở file `backend/src/routes/poi.routes.js`, dòng `16`*
4. Backend tạo một document mới trong collection `PoiRequests` với trạng thái `PENDING`.
5. Backend trả về thông báo thành công cho Owner.

### 2. Admin Review & Approve POI
1. Admin truy cập `AdminChangeRequestsPage` hoặc `OwnerSubmissionsPage`.

> *Vị trí: `AdminChangeRequestsPage` nằm ở file `admin-web/src/pages/AdminChangeRequestsPage.jsx`, dòng `4`*
> *Vị trí: `OwnerSubmissionsPage` nằm ở file `admin-web/src/pages/OwnerSubmissionsPage.jsx`, dòng `30`*
2. Frontend gọi `GET /api/admin/pois/change-requests` hoặc `/pending`.

> *Vị trí: `GET /api/admin/pois/change-requests` nằm ở file `backend/src/routes/admin-poi.routes.js`, dòng `18`*
3. Backend trả về danh sách các POI request đang chờ duyệt.
4. Admin kiểm tra nội dung, vị trí và bấm nút **Approve**.
5. Frontend gọi `POST /api/admin/pois/:id/approve`.
6. Backend thực hiện các bước atomic:
   - Cập nhật collection `POIs` master (tạo mới record hoặc update record hiện tại).

> *Vị trí: `POIs` nằm ở file `Application/Interfaces/Services/IGeofenceService.cs`, dòng `5`*
   - Cập nhật trạng thái trong `PoiRequests` thành `APPROVED`.
   - Ghi log hành động vào collection `Audits`.
7. Backend trả về kết quả thành công.
8. Frontend cập nhật UI, loại bỏ request khỏi danh sách chờ.

### 3. Admin Reject POI
1. Admin xem chi tiết request thấy vi phạm (ví dụ: tọa độ sai) và bấm **Reject** (kèm lý do).
2. Frontend gọi `POST /api/admin/pois/:id/reject` với payload lý do (reason).
3. Backend cập nhật trạng thái `PoiRequests` thành `REJECTED`, lưu lý do từ chối.
4. Backend ghi log Audit.
5. Backend trả về thành công, Frontend cập nhật giao diện, gửi notify về cho Owner.
