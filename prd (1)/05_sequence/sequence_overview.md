# 5. Sequence Overview

## 5.1 Cross-system Interaction (Current)

1. Admin thao tác POI/User trên web admin.
2. Web admin gọi backend API.
3. Backend đọc/ghi Mongo, trả DTO.
4. Mobile (khi auth) sync POIs từ backend nearby API.
5. Mobile upsert core POI vào SQLite + inject localization runtime.
6. User tương tác tại mobile qua:
   - QR flow (manual/camera),
   - map flow,
   - geofence auto flow.
7. Mobile định kỳ gửi Intelligence Events (Telemetry) về Backend.
8. Backend Ingestion nhận Event, lưu Raw và thực hiện Rollup Worker để cập nhật Metric Stats.

## 5.2 Main Participants For Detailed Sequences

- **Actors**: Tourist/User, Owner, Admin, System.
- **UI layer**: Page/View, Admin Web Dashboard.
- **Presentation**: ViewModel.
- **Domain/Service**: Coordinator, Geofence, Narration, Translation, Navigation, Intelligence Ingestion.
- **Persistence**: SQLite, MongoDB, Redis (Cache).
- **External**: API endpoint, translation provider, OS TTS/location stack.

## 5.3 Thread Context Conventions

- **MainThread**: UI binding mutation, Shell navigation, AppState collection/property changes quan trọng.
- **Background**: network call, DB IO, translation call, timer loop body, Intelligence telemetry.
- **Mixed**: map tracking loop thực hiện logic nền nhưng nhảy về MainThread cho UI draw/selection.
