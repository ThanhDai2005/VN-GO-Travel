# VN GO Travel

Ứng dụng du lịch theo vị trí xây dựng bằng .NET MAUI, tập trung vào:
- geofence narration
- map + POI
- dữ liệu offline cơ bản
- QR flow để mở đúng POI

---

## Trạng thái hiện tại

Dự án hiện đã có lõi hoạt động cho các phần sau:

- load POI từ `pois.json` vào SQLite
- hiển thị map + user location + POI
- geofence chọn POI theo priority rồi khoảng cách
- phát narration bằng TTS
- mở `PoiDetailPage`
- QR scanner trong app để mở đúng POI theo `Code`

### QR hiện tại
**Baseline đóng băng + checklist hồi quy:** xem `docs/QR_MODULE.md`.

Đã có:
- `QrScannerPage` / `QrScannerViewModel` / `QrResolver` / `PoiEntryCoordinator`
- Deep link Android (host `thuyetminh.netlify.app`, `/poi/` và `/p/`)
- Landing Netlify + handoff “Mở trong ứng dụng” (`web/`)

Flow tóm tắt:
1. Payload (QR, URL, tay) → `QrResolver` → DB → `PoiDetailPage`
2. Link ngoài → `MainActivity` → `DeepLinkCoordinator` → cùng pipeline POI

Hạn chế còn lại: cold-start deep link — `docs/DEEP_LINK_LIMITATIONS.md`

---

## Mục tiêu ngắn hạn
1. ổn định QR in-app flow
2. hỗ trợ parser cho QR dạng link
3. chuẩn bị kiến trúc deep link
4. tránh phá flow map/geofence hiện tại

---

## Tech Stack
- .NET MAUI
- C#
- SQLite
- .NET MAUI Maps
- ZXing.Net.Maui

---

## Cấu trúc project
```text
MauiApp1/
│── Models/
│── Services/
│── ViewModels/
│── Views/
│── Resources/
│── Platforms/
│── docs/
```

---

## Tài liệu quan trọng
- `04_mvp_scope.md`
- `05_core_business_rules.md`
- `06_simple_architecture.md`
- `08_test_checklist.md`
- `09_qr_strategy.md`

Nếu code và docs lệch nhau, ưu tiên cập nhật docs trước rồi mới chỉnh code.

---

## Hướng phát triển tiếp theo
- hoàn tất QR parser theo target formats
- ổn định open-on-map flow từ detail
- thêm deep link / app link
- bổ sung landing page khi cần
