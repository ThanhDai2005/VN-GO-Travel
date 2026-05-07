# 5. Sequence - Geofencing

## Participants
- Actor: System (auto), Tourist/User
- View: `MapPage`

> *Vị trí: `MapPage` nằm ở file `Views/MapPage.xaml.cs`, dòng `38`*
- ViewModel: `MapViewModel`

> *Vị trí: `MapViewModel` nằm ở file `ViewModels/MapViewModel.cs`, dòng `56`*
- Services: `GeofenceService`, `AudioService/PoiNarrationService`

> *Vị trí: `GeofenceService` nằm ở file `Services/GeofenceService.cs`, dòng `30`*
- Data: `AppState.Pois`, SQLite-backed POIs (đã load trước đó)
- Database: SQLite gián tiếp (dữ liệu đã được load vào AppState trước đó)
- External API: Device location API, OS TTS engine

## Main Sequence

1. `MapPage` timer tick (mỗi 5s) gọi `MapViewModel.UpdateLocationAsync`.

> *Vị trí: `MapPage` nằm ở file `Views/MapPage.xaml.cs`, dòng `38`*
> *Vị trí: `MapViewModel.UpdateLocationAsync` nằm ở file `ViewModels/MapViewModel.cs`, dòng `299`*
2. ViewModel lấy location từ provider.
3. ViewModel cập nhật `AppState.CurrentLocation` trên MainThread.
4. ViewModel gọi `GeofenceService.CheckLocationAsync(location)`.
5. Geofence check gate/throttle/jitter/modal.
6. Geofence snapshot `AppState.Pois` trên MainThread.
7. Geofence lọc candidate trong bán kính, sort theo priority/distance.
8. **Decision** trigger allowed?
   - nếu active same poi/cooldown chưa hết -> suppress.
   - nếu hợp lệ -> gọi speak với narration text.
9. Audio service phát TTS.

## Thread Context

- Timer loop: background.
- AppState mutation/snapshot collection: MainThread.
- Candidate evaluation + cooldown logic: background.
- TTS call: async background + OS speech pipeline.

## Race Conditions / Duplicate Triggers

- `MapPage.StartTrackingAsync` còn có auto-select nearest và gọi `_vm.PlayPoiAsync`.

> *Vị trí: `MapPage.StartTrackingAsync` nằm ở file `Views/MapPage.xaml.cs`, dòng `287`*
> *Vị trí: `_vm.PlayPoiAsync` nằm ở file `ViewModels/MapViewModel.cs`, dòng `270`*
- Đồng thời `GeofenceService` cũng trigger speak.

> *Vị trí: `GeofenceService` nằm ở file `Services/GeofenceService.cs`, dòng `30`*
- Hai luồng có thể chồng nhau, đặc biệt khi vào vùng mới và pin auto-select trùng thời điểm.

## Real Suppression Conditions

- `MIN_LOCATION_INTERVAL_MS`
- `MIN_MOVEMENT_METERS`
- per-POI `TRIGGER_COOLDOWN_MS`
- `_gate` busy skip
- `AppState.IsModalOpen` skip
