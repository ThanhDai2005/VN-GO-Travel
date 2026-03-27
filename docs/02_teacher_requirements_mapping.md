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
- Real-time GPS
- POI with lat/lng, radius, priority
- Auto trigger narration
- Debounce and cooldown
- Multi-language TTS
- No overlapping audio
- Audio queue management
- POI data management
- Map view

## Handwritten Notes - Expansion
- CMS
- Data analytics
- QR code activation
- AI features