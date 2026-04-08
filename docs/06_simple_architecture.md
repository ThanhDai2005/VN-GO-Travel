# 6. Simple Architecture

## Main Components
1. `LocationService`
2. `GeofenceService`
3. `AudioService`
4. `PoiDatabase`
5. `MapPage / MapViewModel`
6. `QrScannerPage / QrScannerViewModel`
7. `QrResolver`
8. `PoiEntryCoordinator` (new)
8. `PoiDetailPage / PoiDetailViewModel`
9. `DeepLinkHandler` (planned)

## Responsibilities

### `LocationService`
- lấy GPS hiện tại
- xử lý quyền vị trí
- cung cấp vị trí cho map/geofence

### `GeofenceService`
- tính khoảng cách giữa user và POI
- xác định POI hợp lệ
- chọn POI theo priority rồi khoảng cách
- trigger auto narration theo luật hiện hành

### `AudioService`
- chỉ cho phép một luồng TTS chính
- stop/cancel audio hiện tại khi có manual play mới
- tránh chồng tiếng

### `PoiDatabase`
- đọc/ghi POI từ SQLite
- tra POI theo `Code`
- áp dụng language fallback

### `MapViewModel`
- giữ language hiện tại
- load POI
- quản lý `SelectedPoi`
- hỗ trợ request focus theo `Code`
- điều hướng mở scanner QR

### `MapPage`
- render map
- render user pin + POI pins
- theo dõi vị trí định kỳ
- focus map đến POI đang chọn hoặc pending focus

### `QrScannerPage`
- quản lý lifecycle camera
- xin quyền camera
- debounce scan event
- chuyển chuỗi scan được sang viewmodel

### `QrScannerViewModel`
- nhận event scan
- gọi `QrResolver.Parse()` để trích xuất `Code`
- lookup local DB (`PoiDatabase.GetByCodeAsync()`)
- điều hướng sang `PoiDetailPage` khi có POI
### `PoiEntryCoordinator`
- new, small coordinator that centralizes "raw input -> Code -> POI -> navigation" flow
- responsible for: parsing raw input (via `QrResolver`), initializing DB, resolving `Poi` and performing navigation to `PoiDetailPage`
- intended to be reused by scanner, future deep-link handler, or manual entry

### `QrResolver`
- đọc dữ liệu từ QR (text)
- phân biệt các định dạng QR: `poi://`, `poi:`, plain, và URL paths `/p/{CODE}` hoặc `/poi/{CODE}` khi payload là absolute URL
- chuẩn hóa về `Code` (trim + uppercase)

### `PoiDetailPage`
- hiển thị chi tiết POI
- cho phép user phát narration thủ công
- cho phép mở lại đúng POI trên map

### `DeepLinkHandler` (app-side stub, planned)
- app-side handler/stub exists to accept raw URLs and reuse the shared `PoiEntryCoordinator` flow
- this is a planned-only entry point (no platform wiring in this phase). When platform code receives a link it should create a `PoiEntryRequest` and call the coordinator via this handler.

## Architectural Principle
Mọi nguồn vào đều nên hội tụ về cùng một lõi xử lý:

- geofence -> chọn `POI`
- QR scanner -> parse ra `Code`
- deep link -> parse ra `Code`
- manual selection -> chọn `POI`

Sau đó dùng chung:
- `Code -> PoiDatabase -> Poi`
- `Poi -> Detail / Map / Narration`
