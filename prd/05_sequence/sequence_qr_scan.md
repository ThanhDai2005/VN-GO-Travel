# 5. Sequence - QR Scan

## Participants
- Actor: Tourist/User
- View: `QrScannerPage`

> *Vị trí: `QrScannerPage` nằm ở file `Views/QrScannerPage.xaml.cs`, dòng `36`*
- ViewModel: `QrScannerViewModel`

> *Vị trí: `QrScannerViewModel` nằm ở file `ViewModels/QrScannerViewModel.cs`, dòng `53`*
- Services: `PoiEntryCoordinator`, `QrResolver`, `NavigationService`, `ApiService`

> *Vị trí: `PoiEntryCoordinator` nằm ở file `Services/PoiEntryCoordinator.cs`, dòng `39`*
> *Vị trí: `NavigationService` nằm ở file `Services/NavigationService.cs`, dòng `17`*
> *Vị trí: `ApiService` nằm ở file `Services/ApiService.cs`, dòng `16`*
- Data: SQLite (`pois`), in-memory localization, Mongo (qua backend API)
- External API: `POST /api/v1/pois/scan` (secure token path)

> *Vị trí: `POST /api/v1/pois/scan` nằm ở file `backend/src/routes/poi.routes.js`, dòng `16`*

## Main Sequence (Manual/Camera)

1. User quét QR hoặc nhập code.
2. `QrScannerPage` chuyển raw text cho `QrScannerViewModel`.

> *Vị trí: `QrScannerPage` nằm ở file `Views/QrScannerPage.xaml.cs`, dòng `36`*
> *Vị trí: `QrScannerViewModel` nằm ở file `ViewModels/QrScannerViewModel.cs`, dòng `53`*
3. VM set processing phase, gọi `PoiEntryCoordinator.HandleEntryAsync`.

> *Vị trí: `PoiEntryCoordinator.HandleEntryAsync` nằm ở file `Services/PoiEntryCoordinator.cs`, dòng `69`*
4. Coordinator parse bằng `QrResolver`.
5. **Decision** token scan?
   - **No**:
     1. Query local POI theo code từ SQLite.
     2. Build route map/detail.
   - **Yes**:
     1. Gọi backend `POST /pois/scan`.
     2. Backend verify JWT + validate POI status + quota/premium.
     3. Trả POI payload.
     4. Coordinator upsert local core POI + inject localization runtime.
     5. Build route.
6. Coordinator gọi `NavigationService.NavigateToAsync`.

> *Vị trí: `NavigationService.NavigateToAsync` nằm ở file `Services/Observability/ObservingNavigationService.cs`, dòng `47`*
7. `NavigationService` serialize và gọi `Shell.GoToAsync`.

> *Vị trí: `NavigationService` nằm ở file `Services/NavigationService.cs`, dòng `17`*
8. User đến page đích.

## Thread Context

- Parse và coordinator logic: background.
- Network/API call: background.
- Shell navigation: MainThread (qua `NavigationService`).

> *Vị trí: `NavigationService` nằm ở file `Services/NavigationService.cs`, dòng `17`*
- AppState selection update: MainThread dispatch.

## Race Conditions / Duplicate Triggers

- Scanner-level guard: `_isHandlingScan` + `IsProcessingScan`.
- Coordinator duplicate suppression theo `lastHandledCode + time window`.
- Navigation-level reject nếu `_isNavigating`.
- Tác dụng phụ: có thể suppress quá mức khi user thao tác nhanh liên tiếp.

## Real Error Paths

- QR format sai -> `InvalidFormat`.
- POI local không có -> fail not found.
- Token sai/hết hạn -> backend 401/4xx.
- Hết quota free scan -> backend 403.
