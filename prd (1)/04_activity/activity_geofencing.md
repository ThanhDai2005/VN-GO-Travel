# 4. Activity - Geofencing

## Scope
- Từ lúc timer map tick đến khi trigger hoặc suppress narration theo vị trí.

## Step-by-step Activity

1. `MapPage` timer (5s) chạy vòng lặp tracking.

> *Vị trí: `MapPage` nằm ở file `Views/MapPage.xaml.cs`, dòng `38`*
2. Gọi `MapViewModel.UpdateLocationAsync`.

> *Vị trí: `MapViewModel.UpdateLocationAsync` nằm ở file `ViewModels/MapViewModel.cs`, dòng `299`*
3. Lấy GPS hiện tại từ location provider.
4. Update `AppState.CurrentLocation` trên MainThread.
5. Gọi `GeofenceService.CheckLocationAsync`.

> *Vị trí: `GeofenceService.CheckLocationAsync` nằm ở file `Services/Observability/ObservingGeofenceService.cs`, dòng `18`*
6. Geofence pre-check:
   - bỏ qua nếu modal đang mở.
   - bỏ qua nếu interval quá ngắn.
   - bỏ qua nếu dịch chuyển < ngưỡng jitter.
   - bỏ qua nếu gate đang bận.
7. Snapshot danh sách POI từ AppState (MainThread).
8. Tính khoảng cách và lọc candidate trong bán kính.
9. Sort candidate:
   - priority giảm dần,
   - distance tăng dần.
10. **Decision**: có candidate?
    - **No**: clear active poi id, kết thúc.
11. Lấy POI tốt nhất.
12. **Decision**: đã active POI này hoặc còn cooldown?
    - **Yes**: suppress trigger.
    - **No**: ghi active POI + timestamp trigger.
13. Gọi audio speak theo ngôn ngữ hiện tại.

## Key Decisions/Conditions

- Cooldown theo POI để chống lặp trigger trong khoảng ngắn.
- Modal open đóng vai trò hard-stop để tránh phát audio khi đang dialog.
- Candidate tie-break theo priority trước distance.

## Known Imperfections

- Có đường trigger narration thứ hai trong `MapPage.StartTrackingAsync` (auto-select + `_vm.PlayPoiAsync`) song song với geofence trigger.

> *Vị trí: `MapPage.StartTrackingAsync` nằm ở file `Views/MapPage.xaml.cs`, dòng `287`*
> *Vị trí: `_vm.PlayPoiAsync` nằm ở file `ViewModels/MapViewModel.cs`, dòng `270`*
- Điều này có thể tạo duplicate hoặc tranh chấp “ai phát trước”.
