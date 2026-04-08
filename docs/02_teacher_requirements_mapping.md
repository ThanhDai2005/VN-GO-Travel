# 2. Teacher Requirements Mapping

## Slide 1 - Framework .NET MAUI
- GPS & Background
- Geofencing
- TTS/Audio
- Map
- Offline with SQLite and preloaded audio

## Slide 2 - Sample Flow
- App loads POI list
- Background service updates location
- Geofence Engine finds nearest/highest-priority POI
- Narration Engine decides whether to play
- System logs playback to avoid duplicates

## Slide 3 - Suggested Architecture
- Location + Geofencing
- Geofence Engine
- Narration Engine
- Content Layer
- UI/UX

## Handwritten Notes - Core
- real-time GPS
- POI with lat/lng, radius, priority
- auto trigger narration
- debounce and cooldown
- multi-language TTS
- no overlapping audio
- audio queue management
- POI data management
- map view

## Handwritten Notes - Expansion
- CMS
- data analytics
- QR code activation
- AI features

## Current Mapping to Code
### Đã có trong code
- map + POI load local
- GPS lấy vị trí hiện tại
- geofence chọn POI theo priority rồi khoảng cách
- audio service tránh chồng tiếng theo kiểu cancel current speech
- SQLite tra POI theo `Code` và `LanguageCode`
- QR scanner in-app mở `PoiDetailPage`

### Đã có trong docs nhưng chưa hoàn chỉnh trong code
- debounce/cooldown geofence rõ ràng
- deep link / app link
- link-based QR cho camera ngoài app
- landing page cho user chưa có app

## Mapping Decision
QR được xem là phần mở rộng đúng với định hướng giáo viên, nhưng phải được triển khai như:
- kênh truy cập POI bổ sung
- không thay thế geofence
- dùng chung lõi `Code -> POI`
