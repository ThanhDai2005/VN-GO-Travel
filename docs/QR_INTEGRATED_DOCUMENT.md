# QR, Web & Deep Link — Integrated Document (v1)

Tài liệu này là nguồn tham chiếu duy nhất cho toàn bộ hệ thống QR, giao diện Web và Deep Link của dự án VN-GO Travel. Nó kết hợp các thông tin từ các tài liệu riêng lẻ trước đây (`QR_MODULE`, `QR_SEQUENCE`, `QR_TEST_MATRIX`, v.v.).

---

## 1. Hợp đồng URL Công cộng (Public URL Contract)

Hệ thống sử dụng một host duy nhất cho landing page và chuyển vùng app.

| Mục | Giá trị |
|------|--------|
| **Public host** | `thuyetminh.netlify.app` |
| **URL POI chính tắc** | `https://thuyetminh.netlify.app/poi/{CODE}` |
| **Đường dẫn ngắn (chỉ cho App)** | `https://thuyetminh.netlify.app/p/{CODE}` — Được hỗ trợ bởi **Android Intent Filters** và **`QrResolver`**. Web landing hiện chỉ hỗ trợ `/poi/`. |

---

## 2. Chuẩn hóa mã POI (Normalization)

Tất cả các con đường nhập liệu (Scanner, Deep Link, Manual) đều quy tụ về **`QrResolver.Parse`**.

- **Quy tắc:** `Trim()` đầu cuối, sau đó chuyển thành **UPPERCASE** (Invariant).
- **Định dạng hỗ trợ:**
  - `poi:CODE` hoặc `poi://CODE`
  - Token thuần (ví dụ: `HO_GUOM`)
  - URL tuyệt đối: `https://thuyetminh.netlify.app/poi/CODE` hoặc `.../p/CODE`

---

## 3. Luồng xử lý QR & Deep Link trong App

### 3.1. Thành phần điều phối
- **`PoiEntryCoordinator`**: Điểm vào duy nhất. Quyết định mở màn hình Bản đồ (`Map`) hay Chi tiết (`Detail`).
- **`QrResolver`**: Phân tích cú pháp chuỗi quét được.
- **`NavigationService`**: Thực hiện chuyển trang một cách an toàn (serialized).
- **`DeepLinkCoordinator` & `Handler`**: Xử lý Intent từ Android.

### 3.2. Chế độ điều hướng (Navigation Modes)
- **`NavigationMode.Map`** (Mặc định cho QR Cam): Mở tab Bản đồ, tập trung vào POI, hiển thị panel thông tin bên dưới và tự động phát thuyết minh ngắn (`narrate=1`).
- **`NavigationMode.Detail`** (Mặc định cho nhập tay & Deep Link): Mở ngay trang chi tiết POI.

---

## 4. Tương tác Web → App (Android Handoff)

| Nền tảng | Hành vi |
|----------|-----------|
| **Android** | Sử dụng **Intent URL** để cố gắng mở app trực tiếp. Nếu chưa cài app, trình duyệt sẽ quay lại landing page nhờ `S.browser_fallback_url`. |
| **Khác** | Hiển thị landing page với thông tin POI cơ bản (tên, mô tả). |

---

## 5. Danh sách kiểm tra Regression (Kiểm thử)

| # | Trường hợp | Các bước | Kết quả kỳ vọng |
|---|------------|----------|----------------|
| R1 | **Load trang web POI** | Mở `https://thuyetminh.netlify.app/poi/HO_GUOM` | Hiện tên + mô tả (ưu tiên Tiếng Việt). |
| R2 | **Mở trong ứng dụng** | Nhấn "Mở trong ứng dụng" trên web | App Android mở đúng POI đó. |
| R3 | **Quét QR trong app** | Dùng camera quét URL hoặc `poi:CODE` | App chuyển hướng đúng (thường là về Map). |
| R4 | **Nhập mã tay** | Nhập `HO_GUOM` vào ô Manual | App mở trang Chi tiết. |
| R5 | **Mã không tồn tại** | Quét mã không có trong DB | Hiện thông báo: "POI not available locally". |
| R6 | **Chống lặp** | Quét liên tục cùng mã | Chỉ điều hướng 1 lần duy nhất (Deduplication). |

---

## 6. Sơ đồ trình tự (Trường hợp Quét trong App)

1. **User** mở Scanner trong app.
2. **Scanner** đọc được chuỗi payload.
3. **QrScannerViewModel** gọi `PoiEntryCoordinator.HandleEntryAsync`.
4. **Coordinator** dùng `QrResolver` để lấy `Code`.
5. **Coordinator** gửi yêu cầu điều hướng đến `NavigationService`.
6. **NavigationService** đẩy route tương ứng lên Shell (`//map` hoặc `poidetail`).
7. **MapPage/PoiDetailPage** nhận tham số qua Query và render dữ liệu.

---

## 7. Mẫu Payload hợp lệ
- `poi:HO_GUOM`
- `poi://ND_TEMPLE_01`
- `https://thuyetminh.netlify.app/poi/DA_NANG_BRIDGE`
- `DA_NANG_BRIDGE` (Token thuần)
