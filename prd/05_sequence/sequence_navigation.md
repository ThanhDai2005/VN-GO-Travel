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

1. ViewModel/Coordinator yêu cầu navigate (`NavigateToAsync`, `PushModalAsync`, `GoBackAsync`).

> *Vị trí: `NavigateToAsync` nằm ở file `Services/Observability/ObservingNavigationService.cs`, dòng `47`*
> *Vị trí: `PushModalAsync` nằm ở file `Services/Observability/ObservingNavigationService.cs`, dòng `18`*
> *Vị trí: `GoBackAsync` nằm ở file `Services/Observability/ObservingNavigationService.cs`, dòng `57`*
2. `NavigationService.StartNavigationAsync` check `_isNavigating`.

> *Vị trí: `NavigationService.StartNavigationAsync` nằm ở file `Services/NavigationService.cs`, dòng `142`*
3. Nếu pass:
   - acquire `_navGate`.
   - execute navigation trên MainThread.
4. Cập nhật modal count trong AppState (với modal operations).
5. (Luồng Audio): `AudioQueueService` / `PoiNarrationService` tiếp tục duy trì trạng thái phát background, không bị gián đoạn (interrupt) trừ khi người dùng chủ động gọi `Stop()`.

> *Vị trí: `PoiNarrationService` nằm ở file `Services/PoiNarrationService.cs`, dòng `42`*
6. Release `_navGate`, reset `_isNavigating`.

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
