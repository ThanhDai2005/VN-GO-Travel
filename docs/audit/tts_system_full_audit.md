# TTS System Full Audit

## 1. System Overview

This document provides an end-to-end audit of the **Text-to-Speech (TTS) / Narration system** in the VN-GO Travel MAUI application. The system is designed for high reliability across Android/iOS, featuring automated translation integration and reactive state management.

### Key Components
- **`AudioService`**: Low-level platform wrapper for `Microsoft.Maui.Media.TextToSpeech`.
- **`PoiNarrationService`**: The primary business orchestrator for all POI audio flows.
- **`LanguageSwitchService`**: Manages audio state during cross-language transitions.
- **`AppState`**: Tracks `ActiveNarrationCode` and `IsTranslating` state.

---

## 2. End-to-End Narration Flow

### 2.1 Trigger Phase (User Action)
1. **Source**: User taps a pin on the Map or the "Play" button in the Detail panel.
2. **Entry**: `MapViewModel` or `PoiDetailViewModel` calls `PoiNarrationService.PlayPoiAsync` (short) or `PlayPoiDetailedAsync` (long).
3. **State**: The `AppState.ActiveNarrationCode` is set to the current POI.

### 2.2 Hydration & Translation Phase
1. **Language Resolution**: Service determines the target language (requested vs. current app language).
2. **Translation Guard**: Calls `EnsureTranslatedAsync`.
    - If language is not `vi/en` and translation is missing/fallback, it acquires the `_translationGate` semaphore.
    - Triggers `TranslationOrchestrator` to fetch dynamic translation via API (Langbly/GTranslate).
3. **UI Sync**: After translation, the service updates the `SelectedPoi` and `Pois` collection on the **Main Thread** to ensure labels match the audio immediately.

### 2.3 Audio Playback Phase (Serialized)
1. **Text Selection**: Picks `NarrationShort` or `NarrationLong` (falls back to `Name` if empty).
2. **Platform Call**: `AudioService.SpeakAsync` is called.
3. **Concurrency Control**: 
    - Acquires `_speakSemaphore` (global serialization).
    - Cancels any existing `CancellationTokenSource` from previous speech.
4. **Locale Resolution**: 
    - Maps 2-letter code (e.g., `ja`) to BCP-47 tag (e.g., `ja-JP`).
    - Falls back to `en-US` if no native voice is found.
5. **Output**: Standard MAUI `TextToSpeech.Default.SpeakAsync` executed with 1.0 pitch/volume.

---

## 3. Concurrency & Stability Hardening

### 3.1 Serialization Levels
- **Level 1 (App Logic)**: `_translationGate` in `PoiNarrationService` prevents parallel API translation requests for the same narration event.
- **Level 2 (Audio State)**: `_langSwitchGate` in `LanguageSwitchService` ensures a language switch doesn't collide with the translation/playback logic.
- **Level 3 (Platform Engine)**: `_speakSemaphore` in `AudioService` serializes all platform TTS calls to prevent engine crashes/overlapping audio on Android.

### 3.2 Stability Features
- **Cold-Start Warm-up**: On first initialization, `AudioService` performs a silent "space" speak to initialize the OS TTS engine, reducing first-touch latency.
- **Debounce Window**: 2.5-second debounce in `AudioService` prevents UI spam from rapid-fire user taps.
- **Auto-Restart**: `LanguageSwitchService` captures `activeCodeBeforeSwitch`. If audio was playing during a language change, it automatically stops and restarts in the new language to maintain UX continuity.

---

## 4. Resource & Network Management

- **Translation Check**: Narration will fail-fast with a "Lỗi kết nối" alert if internet is missing and a non-bundled language is requested.
- **Memory Caching**: `AudioService` caches the list of available system locales (`_allLocales`) and resolved locale mappings (`_localeCache`) to avoid expensive platform interop on every speak.
- **Cleanup**: `AudioService.Stop()` properly cancels the `CancellationToken`, ensuring voice output ceases immediately.

---

## 5. Telemetry Integration

The system emits **Runtime Telemetry** for every successful narration start:
- **Producer**: `audio`
- **Action**: `audio_play_short` or `audio_play_long`
- **Context**: Includes `PoiCode`, `Location` (Lat/Lon), and `Timestamp`.

This telemetry data is used directly by the **Heatmap system** to visualize POI "popularity" based on active listening, not just clicks.

---

## 6. Known Behavioral Risks & Notes

1. **Voice Quality**: Depends entirely on the user's installed TTS engine (e.g., Google Speech Services vs. Samsung TTS).
2. **Fallback Voices**: If `vi-VN` is not installed on a device, the system falls back to `en-US`, which may result in poor pronunciation of Vietnamese names.
3. **UI Threading**: UI synchronization (labels/state) happens via `SyncUiAsync` on the main thread, while audio preparation stays off-thread.
4. **Timeout**: Dynamic translation for narration has a hard-coded **15-second timeout**.
