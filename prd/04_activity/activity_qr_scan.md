# 4. Activity - QR Scan

## Scope
- Từ lúc scanner nhận input đến khi điều hướng thành công hoặc báo lỗi.

## Step-by-step Activity

1. User mở scanner.
2. Scanner nhận chuỗi QR (camera/manual).
3. VM kiểm tra lock:
   - nếu đang xử lý -> bỏ qua input.
4. VM chuyển phase `Recognizing` -> `OpeningPoi`.
5. Gọi `PoiEntryCoordinator.HandleEntryAsync`.

> *Vị trí: `PoiEntryCoordinator.HandleEntryAsync` nằm ở file `Services/PoiEntryCoordinator.cs`, dòng `69`*
6. Coordinator parse input:
   - `poi:CODE` / `poi://CODE`
   - URL `/poi/{code}` hoặc `/scan?t=jwt`
   - plain code.
7. **Decision**: token scan?
   - **Yes**:
     - yêu cầu user phải authenticated.
     - gọi backend `POST /pois/scan`.
     - merge POI vào local DB + inject localization runtime.
   - **No**:
     - lookup POI theo code local.
8. **Decision**: POI hợp lệ/tìm thấy?
   - **No** -> set phase lỗi (`InvalidFormat` hoặc `NotFound`), schedule reset.
   - **Yes** -> build route map/detail.
9. **Decision**: duplicate handling trong cửa sổ suppress?
   - **Yes** -> không navigate.
   - **No** -> gọi `NavigationService.NavigateToAsync`.

> *Vị trí: `NavigationService.NavigateToAsync` nằm ở file `Services/Observability/ObservingNavigationService.cs`, dòng `47`*
10. Kết thúc:
   - success: giữ trạng thái processing đến khi page lifecycle reset.
   - fail/cancel: về `Ready` hoặc `ReadyAgain`.

## Key Decisions/Conditions

- `if _isHandlingScan || IsProcessingScan` -> reject scan mới.
- `if parsed.IsSecureScanToken` -> backend path.
- `if result.Navigated == false` -> coi là duplicate/busy suppression.
- Route map thêm query `narrate=1` khi nguồn từ camera scan.

## Known Imperfections

- Lock scanner + lock coordinator + lock navigation chồng nhiều tầng, giảm race nhưng làm flow khó debug.
- Một số reject do “busy” không retry tự động toàn phần, phụ thuộc thao tác người dùng.
