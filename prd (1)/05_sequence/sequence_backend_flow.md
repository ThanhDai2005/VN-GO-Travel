# 5.5 Sequence - Backend Flow & Architecture

Sơ đồ này mô tả sự tương tác giữa các lớp trong Backend khi xử lý một yêu cầu điển hình.

## Các thành phần tham gia (Participants)
- **Client**: Mobile App hoặc Admin Web.
- **Routes**: Tiếp nhận HTTP Request và áp dụng Middleware (Auth, Validation).
- **Controller**: Điều phối luồng và định dạng Response.
- **Service**: Xử lý logic nghiệp vụ chính (Business Logic).
- **Repository**: Trừu tượng hóa việc truy cập dữ liệu (Data Access).
- **MongoDB**: Lưu trữ dữ liệu cuối cùng.

## Luồng xử lý mẫu (Ví dụ: Lấy chi tiết POI)

1. **Request**: Client gửi `GET /api/v1/pois/:code`.
2. **Routing**: 
   - `poi.routes.js` nhận diện endpoint.
   - Middleware kiểm tra tính hợp lệ của mã code.
3. **Controller**: `poi.controller.js` gọi hàm `getPoiByCode`.
4. **Logic Service**: `poi.service.js` thực hiện:
   - Kiểm tra bộ nhớ đệm (Cache).
   - Nếu miss, yêu cầu dữ liệu từ Repository.
5. **Data Access**: `poi.repository.js` thực hiện truy vấn `findOne` vào MongoDB.
6. **Processing**: Service nhận dữ liệu thô, map sang DTO, gán thông tin Zone và trạng thái truy cập của User.
7. **Response**: Controller trả về JSON chuẩn cho Client.

## Đặc điểm kiến trúc
- **Layered Architecture**: Tách biệt rõ rệt giữa Routing, Logic và Data Access giúp dễ bảo trì và test.
- **Singleton Services**: Các service như `poi.service` được khởi tạo một lần duy nhất.
- **Centralized Error Handling**: Mọi lỗi đều được chuyển qua Middleware xử lý lỗi tập trung để đảm bảo Client luôn nhận được format lỗi nhất quán.
