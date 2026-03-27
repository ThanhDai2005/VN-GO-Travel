# 6. Simple Architecture

## Main Components
1. LocationService
2. GeofenceEngine
3. NarrationEngine
4. ContentRepository
5. MapPage / DetailPage / QRPage
6. AudioService
7. QrResolver
8. DeepLinkHandler
9. PoiDetailPage
## Responsibilities

### LocationService
- lấy GPS hiện tại
- theo dõi cập nhật vị trí

### GeofenceEngine
- tính khoảng cách giữa user và POI
- xác định POI hợp lệ
- gửi sự kiện kích hoạt

### NarrationEngine
- kiểm tra trạng thái audio
- quyết định phát TTS hay audio file
- tránh phát trùng lặp

### ContentRepository
- đọc/ghi POI từ SQLite
- cung cấp dữ liệu cho map và detail page

### UI
- hiển thị bản đồ
- hiển thị danh sách/chi tiết POI
- hiển thị POI gần nhất
- hỗ trợ quét QR

### QrResolver
- đọc dữ liệu từ QR
- phân biệt QR dạng `poi:CODE` và QR dạng link
- trích xuất `Code`

### DeepLinkHandler
- xử lý mở app từ link
- điều hướng tới đúng POI khi app được mở từ QR/link

### PoiDetailPage
- hiển thị chi tiết POI
- cho phép user phát narration thủ công