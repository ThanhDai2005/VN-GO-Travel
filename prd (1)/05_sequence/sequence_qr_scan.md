# 5. Sequence - QR Scan

## Participants
- Actor: Tourist/User
- View: `QrScannerPage`
- ViewModel: `QrScannerViewModel`
- Services: `PoiEntryCoordinator`, `QrResolver`, `NavigationService`, `ApiService`, `AppState`
- Data: SQLite (`pois`, `owned_zones`), in-memory localization, Mongo (qua backend API)

## Main Sequence (Manual/Camera)

1. User quét QR hoặc nhập code.
2. `QrScannerPage` chuyển raw text cho `QrScannerViewModel`.
3. VM gọi `PoiEntryCoordinator.HandleEntryAsync`.
4. Coordinator parse bằng `QrResolver`.
5. **Decision** token scan (Secure QR)?
   - **No (Static Code)**:
     1. Query local POI theo code từ SQLite.
   - **Yes (Token)**:
     1. Gọi backend `POST /api/v1/pois/scan`.
     2. Backend verify JWT + validate POI.
     3. Trả POI payload.
     4. Coordinator upsert local core POI + inject localization runtime.
6. Coordinator chuẩn bị dữ liệu và gọi `NavigationService.NavigateToAsync("PoiDetailPage", {code})`.
7. `NavigationService` thực hiện điều hướng an toàn (Semaphore locked).
8. `PoiDetailPage` khởi tạo. `PoiDetailViewModel` kiểm tra `AppState.OwnedZones`:
   - Nếu POI thuộc Zone đã mua: 
     - Ẩn `PurchaseFrame`.
     - Cho phép "Nghe chi tiết" (Long Narration).
   - Nếu chưa mua:
     - Hiển thị `PurchaseFrame`.
     - Khóa "Nghe chi tiết", chỉ cho "Nghe tóm tắt".

## Thread Context
- Logic parse & coordination: Background.
- Network/API call: Background.
- Shell navigation: MainThread.
- UI Binding (Flat Properties): MainThread.

## Key Changes
- **Unlimited Scanning**: Loại bỏ hoàn toàn logic kiểm tra giới hạn lượt quét (Quota).
- **Zone Ownership**: Quyền lợi được quyết định dựa trên danh sách Zone đã mua trọn đời (Zone Pass).
