# Luồng Xác Thực (Authentication Flows) - VN GO Travel

Tài liệu này mô tả chi tiết luồng Đăng nhập (Login), Đăng ký (Register) và Đăng xuất (Logout) kết nối giữa 3 thành phần của hệ thống: **App (.NET MAUI)**, **Admin-Web (React/Vite)** và **Backend (Node.js/Express)**.

---

## 1. Flow Đăng nhập (Login Sequence)

### A. Phía App (.NET MAUI) -> Backend
1. **Người dùng (User)** nhập Email và Password tại màn hình `LoginPage.xaml`.
2. **ViewModel (`LoginViewModel.cs`)**: Gọi hàm `LoginCommand` khi người dùng nhấn nút "Đăng nhập".
3. **Service (`AuthService.cs`)**: Hàm `LoginAsync(email, password)` được thực thi.
   - Hàm này tạo HTTP request và gửi `POST` tới API endpoint `/api/v1/auth/login`.
4. **Backend (`auth.routes.js` & `auth.controller.js`)**: 
   - Nhận yêu cầu tại hàm `authController.login`.
   - Chuyển tiếp tới **Service (`auth.service.js`)** để kiểm tra email có tồn tại không và so khớp mật khẩu bằng `bcrypt.compare`.
   - Nếu hợp lệ, backend tạo ra một **JWT Token** (JSON Web Token) chứa định danh và quyền của người dùng (Role).
   - Backend phản hồi về App (Status `200 OK`) kèm theo cấu trúc dữ liệu gồm `token` và thông tin `user`.
5. **App xử lý phản hồi**: 
   - `AuthService` nhận token và lưu vào `SecureStorage` (sử dụng khóa `StorageKeyToken` là `"vngo_auth_jwt"`).
   - Gắn session cục bộ (lưu Role, Premium status) và đổi trạng thái `IsAuthenticated = true`.
   - Ứng dụng điều hướng người dùng quay lại màn hình chính hoặc màn hình trước đó.

### B. Phía Admin-Web (React/Vite) -> Backend
1. **Admin/Owner** nhập Email và Password tại màn hình `LoginPage.jsx` (`admin-web/src/pages/LoginPage.jsx`).
2. **Handle Submit**: Hàm `onSubmit` gọi hàm `login(email, password)` từ `apiClient.js`.
   - Hàm này gửi request `POST` tới API endpoint `/api/v1/auth/login`.
3. **Backend (`auth.service.js`)**: (Cùng hàm xử lý với App ở trên). Trả về thông tin user và JWT token.
4. **Admin-Web kiểm tra Role (`LoginPage.jsx`)**: 
   - Trích xuất `payload.user.role`.
   - Nếu role **không phải** là `ADMIN` hoặc `OWNER`, hiển thị lỗi *"Từ chối truy cập. Chỉ tài khoản ADMIN hoặc OWNER..."* và chặn không cho đăng nhập.
5. **Cập nhật AuthContext (`AuthContext.jsx`)**: 
   - Nếu hợp lệ, gọi `loginSuccess(token, user)`.
   - Lưu trữ token vào `localStorage` (`vngo_admin_jwt`) và thông tin user (`vngo_admin_user`).
   - Giao diện điều hướng sang `/dashboard` (nếu là ADMIN) hoặc `/my-pois` (nếu là OWNER).

---

## 2. Flow Đăng ký (Register Sequence)

### A. Phía App (.NET MAUI) -> Backend
1. **Người dùng** nhập Email, Password và (tùy chọn) FullName tại màn hình `RegisterPage.xaml`.
2. **ViewModel (`RegisterViewModel.cs`)**: Gọi hàm `RegisterCommand` xác thực Input cơ bản.
3. **Service (`AuthService.cs`)**: Hàm `RegisterAsync(...)` được thực thi.
   - Tạo HTTP request `POST` với payload `{ fullName, email, password }` gửi tới `/api/v1/auth/register`.
4. **Backend (`auth.controller.js` & `auth.service.js`)**: 
   - Hàm `authController.register` tiếp nhận.
   - Service sẽ mã hóa mật khẩu (`bcrypt.hash`) và lưu một Database Record (User) mới. 
   - Mặc định user mới mang role là `USER`.
   - Backend sinh một JWT token đại diện cho tính hợp lệ của người dùng đó và phản hồi lại HTTP `200/201`.
5. **App xử lý phản hồi**: 
   - App tiếp nhận token và thông tin, coi như **người dùng được đăng nhập luôn**.
   - Lưu trữ JWT vào `SecureStorage` qua hàm `PersistSessionAsync`.
   - Đưa người dùng vào Main App.

### B. Phía Admin-Web (React/Vite) -> Backend
*Lưu ý: Ứng dụng Admin-Web thông thường không cung cấp hình thức "Tự đăng ký" (Self-registration) cho cổng quản trị nội bộ.*
1. **Tạo tài khoản (Quản lý User)**: Admin vào mục Quản lý người dùng (`UserManagementPage.jsx`).
2. **API Call**: Form tạo gửi thông tin tới hàm `createAdminUser(body)` ở `apiClient.js`.
3. **Backend API**: Gọi tới API nội bộ `/api/v1/admin/users` (POST) chuyên dụng cho admin cấp quyền tạo user với role đặc biệt (OWNER/ADMIN).

---

## 3. Flow Đăng xuất (Logout Sequence)

*Hệ thống hiện tại sử dụng cơ chế bảo mật xác thực Phi trạng thái (Stateless - JWT), do vậy việc đăng xuất (Logout) đa phần chỉ xóa phiên lưu cục bộ tại Client, không cần gọi API để hủy Session từ phía Backend.*

### A. Phía App (.NET MAUI)
1. **Người dùng** bấm vào nút "Đăng xuất" (thường trong trang Profile).
2. **ViewModel (`ProfileViewModel.cs`)**: Gọi hàm `LogoutCommand`.
3. **Service (`AuthService.cs`)**: Chạy hàm `LogoutAsync()` $\rightarrow$ `ClearSessionAsync(notify: true)`.
   - Câu lệnh `SecureStorage.Default.Remove(StorageKeyToken)` (và các Key Email, Role, Premium) được thực thi để làm sạch toàn bộ dữ liệu Session ở điện thoại.
   - `_tokenStore.SetToken(null)` làm sạch token trong Context của App.
   - Phát sự kiện `SessionChanged` $\rightarrow$ Ứng dụng điều hướng người dùng ra màn hình chờ hoặc Reset bộ định tuyến.

### B. Phía Admin-Web (React/Vite)
1. **Admin** bấm vào nút log out trên giao diện Navbar (`DashboardLayout.jsx`).
2. **Context (`AuthContext.jsx`)**: Hàm `logout()` được kích hoạt.
   - Gọi `localStorage.clear()` để làm sạch tất cả Token và lưu trữ trên Web Browser của Client.
   - Các biến trạng thái `setToken(null)` và `setUser(null)`.
3. Hành động này sẽ lập tức loại bỏ token JWT ra khỏi các `Headers.Authorization` cho mọi lời gọi API tiếp theo. React Router sau đó điều hướng người dùng trở về màn `/login`.

### C. Phía Backend (Node.js/Express)
1. Không có API Endpoint như `/api/v1/auth/logout`.
2. Do sử dụng cấu trúc JWT Stateless, việc "Logout" có hiệu lực tuyệt đối khi Client chủ động xóa chuỗi token. (Việc bảo mật vòng đời token được dựa vào thời gian sống của token thay vì lưu state).