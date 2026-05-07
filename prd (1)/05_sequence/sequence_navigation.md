# 5. Sequence - Navigation

## Participants
- Actor: Tourist/User hoặc System flow
- View: `QrScannerPage`, `MapPage`, `PoiDetailPage`

> *Vị trí: `QrScannerPage` nằm ở file `Views/QrScannerPage.xaml.cs`, dòng `36`*
> *Vị trí: `MapPage` nằm ở file `Views/MapPage.xaml.cs`, dòng `38`*
> *Vị trí: `PoiDetailPage` nằm ở file `Views/PoiDetailPage.xaml.cs`, dòng `10`*
- ViewModel: `QrScannerViewModel`, `MapViewModel`, `PoiDetailViewModel`

> *Vị trí: `QrScannerViewModel` nằm ở file `ViewModels/QrScannerViewModel.cs`, dòng `53`*
> *Vị trí: `MapViewModel` nằm ở file `ViewModels/MapViewModel.cs`, dòng `56`*
> *Vị trí: `PoiDetailViewModel` nằm ở file `ViewModels/PoiDetailViewModel.cs`, dòng `35`*
- Service: `NavigationService`, `AudioQueueService`, `PoiNarrationService`

> *Vị trí: `NavigationService` nằm ở file `Services/NavigationService.cs`, dòng `17`*
> *Vị trí: `PoiNarrationService` nằm ở file `Services/PoiNarrationService.cs`, dòng `42`*
- Database: N/A trực tiếp (không query DB trong thao tác navigate)
- External API: N/A trực tiếp (dùng Shell/navigation stack nội bộ app)
- Framework: `Shell` navigation stack

## Main Sequence

1. ViewModel/Coordinator yêu cầu điều hướng (`NavigateToAsync`).
2. `NavigationService` kiểm tra cờ `_isNavigating`.
3. **Luồng Reject**: Nếu `_isNavigating == true`, request bị từ chối ngay để tránh lỗi Race Condition (vùng màu vàng trong sơ đồ).
4. **Luồng Chấp nhận**: Nếu `false`, thực hiện:
   - Acquire Semaphore `_navGate`.
   - Set `_isNavigating = true`.
   - Thực thi `Shell.Current.GoToAsync` trên MainThread.
5. **Đặc điểm quan trọng**: Hệ thống Audio (Narration) tiếp tục chạy ngầm (Background), không bị ngắt quãng khi chuyển trang.
6. Kết thúc: Giải phóng Semaphore và reset cờ trạng thái.

## Thread Context

- Request gọi service: có thể background/MainThread.
- `Shell.Current.GoToAsync` được bọc để chạy MainThread.
- State flag `_isNavigating` + semaphore bảo vệ cross-thread request.

## Race Conditions / Duplicate Triggers

- Nếu có request mới khi `_isNavigating == true`, request bị reject (không queue).
- Trong các luồng fire-and-forget, người dùng có thể cảm nhận “bấm nhưng không đi”.
- Map/QR/deeplink có thể cùng phát request navigate, phụ thuộc timing lock để thắng.

## Real Limitation

- Thiết kế ưu tiên tránh crash/race ở cost của reliability thao tác người dùng (drop request).
