# Audio end-to-end audit (code-accurate)

## Scope checked
- Backend: `backend/src/services/audio.service.js`, `backend/src/services/audio-queue.service.js`, `backend/src/routes/audio.routes.js`, `backend/src/socket/audio-queue.socket.js`, `backend/src/services/zone.service.js`, `backend/src/routes/zone.routes.js`, `backend/src/controllers/user-audio-queue.controller.js`
- Mobile (.NET MAUI): `Services/AudioService.cs`, `Services/PoiNarrationService.cs`, `Services/AudioQueueService.cs`, `Application/UseCases/PlayPoiAudioUseCase.cs`
- Admin web: `admin-web/src/pages/AudioAnalyticsPage.jsx`
- Prototype/demo: `mobile-audio-ux/useAudio.ts`, `mobile-audio-ux/schema.ts`, `backend/mobile-app-complete/audio-network.js`

## What is actually implemented end-to-end
### 1) Backend audio generation + analytics
- **Audio generation**: `audio.service.js`
  - Hashes text+lang+voice+version → file `storage/audio/<hash>.mp3`.
  - Uses Google TTS (`google-tts-api`) and axios to build audio.
  - Atomic upsert lock + stale lock takeover.
  - Tracks retries and schedules retry windows.
- **Audio endpoints**: `backend/src/routes/audio.routes.js`
  - `POST /api/v1/audio/generate` → `audioService.generateAudio(...)`
  - `GET /api/v1/audio/stats` (lean stats)
  - `GET /api/v1/audio/analytics` (full analytics)
  - `POST /api/v1/audio/play` + `POST /api/v1/audio/play-event` (analytics tracking)
- **Zone download includes audio metadata**: `zone.service.js`
  - For each POI: `audioService.getAudioStatus(...)` → returns `audio.url` + `audio.ready`
  - Includes `narrationAudioUrl` for offline download clients.
  - Triggers background generation if not ready.

### 2) Backend real-time audio queue (multi-user at same POI)
- **Socket.IO handler**: `backend/src/socket/audio-queue.socket.js`
  - `join-poi`, `leave-poi`, `request-audio`, `audio-completed`, `cancel-audio`
  - Broadcasts `queue-status`, `audio-start`, `audio-next` events.
- **Queue persistence**: `backend/src/services/audio-queue.service.js`
  - Stores per-POI queue in Mongo (`AudioQueueEntry` model).
  - Manages queue positions, play/complete/cancel, and emits intelligence events.

### 3) Mobile (MAUI) audio playback
- **TTS playback**: `Services/AudioService.cs`
  - Uses MAUI `TextToSpeech` and serializes concurrent calls.
  - Debounce logic and locale resolution.
- **Narration orchestration**: `Services/PoiNarrationService.cs`
  - Single entry-point for POI audio.
  - On online connection, uses audio queue (`IAudioQueueService`).
  - When offline/not connected, calls `IAudioPlayerService.SpeakAsync` directly.
  - Tracks active narration and handles translation hydration before playback.
- **Queue client (Socket.IO)**: `Services/AudioQueueService.cs`
  - Connects to backend Socket.IO, emits `join-poi`, `request-audio`, `audio-completed`, `cancel-audio`.
  - Raises `AudioStartRequested` and `QueueStatusUpdated` events consumed by `PoiNarrationService`.
- **Use case**: `Application/UseCases/PlayPoiAudioUseCase.cs`
  - Checks premium entitlement, loads POI, then plays via `IAudioPlayerService`.

### 4) Admin web surface
- **Audio analytics UI**: `admin-web/src/pages/AudioAnalyticsPage.jsx`
  - Calls `GET /api/v1/audio/stats` and renders KPIs + top POIs/zones.

## End-to-end flow (as implemented)
1. **Zone scan / download** returns POI list with `audio.url`, `audio.ready`, and `narrationAudioUrl`.
2. **Backend** generates/serves TTS audio files in `storage/audio` and tracks analytics.
3. **Mobile** triggers playback using `PoiNarrationService`.
   - If connected: joins queue and waits for `audio-start`.
   - If offline/not connected: plays TTS locally via `AudioService`.
4. **Playback completion** notifies server (queue advance) when using queue mode.
5. **Admin web** consumes `audio/stats` for analytics UI.

## What is NOT wired end-to-end in production code
- `mobile-audio-ux/*` and `backend/mobile-app-complete/audio-network.js` are **prototype/demo** assets. They are not referenced by the MAUI app or backend routes.
- No evidence of MAUI downloading and caching **remote MP3 audio files**; MAUI currently uses **local TTS** playback instead.

## Key files to verify
- Backend: `backend/src/services/audio.service.js`, `backend/src/routes/audio.routes.js`, `backend/src/socket/audio-queue.socket.js`, `backend/src/services/audio-queue.service.js`, `backend/src/services/zone.service.js`
- Mobile: `Services/PoiNarrationService.cs`, `Services/AudioService.cs`, `Services/AudioQueueService.cs`
- Admin web: `admin-web/src/pages/AudioAnalyticsPage.jsx`

## Summary
- **Backend**: TTS generation + audio queue + analytics endpoints are fully implemented.
- **Mobile (MAUI)**: uses local TTS for narration and can coordinate playback via Socket.IO queue when online.
- **Admin web**: provides audio analytics dashboard.
- Prototype audio caching/queue systems exist in repo but are not wired into production MAUI flow.