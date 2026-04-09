# 4. MVP Scope

## Objective
Chuẩn hoá và stabilise PoC thành ứng dụng demo có luồng thực tế cho user: map, POI, narration và QR in-app.

## MVP Features (current)
- Map hiển thị vị trí user và POI
- Hiển thị danh sách POI từ SQLite
- Focus / highlight POI trên map
- Xem chi tiết POI (PoiDetailPage)
- TTS / audio playback với policy tránh chồng tiếng
- SQLite lưu dữ liệu offline
- Hỗ trợ đa ngôn ngữ cơ bản
- Debounce / cooldown cho triggers
- In-app QR scanner mở POI (stable)

## QR status (current)
- In-app QR scan: stable
- Parser in-app hỗ trợ:
  - `poi:CODE`
  - `poi://CODE`
  - plain `CODE`
  - `https://domain/poi/CODE` and `https://domain/p/CODE` (parsed inside app scanner)
- Flow after scan: parse -> resolve Code -> lookup local SQLite -> open PoiDetailPage -> optional Open on Map

## Deferred / Out of scope for this phase
- Android warm/background deep link đã có nhưng cold-start chưa hardened hoàn toàn
- iOS universal links chưa hoàn thiện production-level
- External camera end-to-end phụ thuộc cấu hình host/OS, chưa coi là fully stable ở mọi thiết bị
- Deferred deep linking và analytics nâng cao chưa triển khai

## Done Definition for MVP (subset)
- Map renders and POI load from SQLite
- QR in-app scan -> parse -> open PoiDetailPage (works)
- Link-based QR parsing inside app scanner (supported)
- Offline open of local POI works when data present

## Notes
- This phase focuses on documentation and tests; no broad refactor or platform deep-linking is performed.
