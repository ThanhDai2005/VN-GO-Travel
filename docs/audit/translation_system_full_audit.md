# Translation System Full Audit

## 1. System Overview

This document describes the **current runtime behavior** of translation/localization in `VN-GO-Travel-D` exactly as implemented.

- Core POI geo data is stored in SQLite (`pois` table).
- Localized text baseline is loaded into memory from `pois.json` by `LocalizationService`.
- **Tech Stack**: Custom .NET MAUI implementation; no external i18n libraries (like i18next).
- **Directory Structure**:
    - `Resources/Raw/pois.json`: Primary seed database.
    - `Services/`: Core i18n logic (`PreferredLanguageService`, `LocalizationService`, `LanguagePackService`).
- On-demand translation is handled by `PoiTranslationService`.
- Auto-translated text is persisted in SQLite cache table `poi_translation_cache`.
- Dynamic localized text is injected into in-memory lookup using `LocalizationService.RegisterDynamicTranslation(...)`.
- UI consumes localized content through hydrated `Poi` instances in `AppState`.
- **UI Localization**: Static labels (e.g., "Scan QR") are currently hardcoded in XAML; localization primarily covers POI-specific content.

Primary components:

- `LocalizationService`
- `PoiTranslationService`
- `PreferredLanguageService` (Language state & persistence via `Preferences`)
- `LanguagePackService` (Download/Network awareness)
- `PoiDatabase` (`IPoiQueryRepository`, `ITranslationRepository`)
- `PoiFocusService`
- `PoiNarrationService`
- `BackgroundTaskService`
- `MapPage` / `MapViewModel`
- `PoiDetailViewModel`
- `QrScannerViewModel` + `PoiEntryCoordinator` (QR path)
- `LanguageSelectorViewModel` / `AddLanguageViewModel`

---

## 2. Full Flow Diagram (text-based)

### 2.1 Baseline Localization Hydration (no API call)

UI/View
-> ViewModel/Service requests POIs or one POI
-> `LocalizationService.GetLocalizationResult(code, lang)`
-> in-memory dictionary lookup `(CODE, lang)`
-> fallback chain: requested -> `vi` -> first available
-> hydrated `Poi` returned
-> `AppState` updated
-> UI bindings refresh

### 2.2 On-demand Translation Flow (API path)

UI/View
-> Entry service (`PoiFocusService` or `PoiNarrationService` or `BackgroundTaskService`)
-> `PoiTranslationService.GetOrTranslateAsync(code, targetLang)`
-> `IPoiQueryRepository.GetExactByCodeAndLanguageAsync(...)` (direct row check)
-> key-based gate: `_locks[key]` (`SemaphoreSlim`)
-> re-check direct row
-> `ITranslationRepository.GetTranslationCacheAsync(code, targetLang)`
-> if cache hit: merge cached text + source geo -> return hydrated `Poi`
-> if cache miss: get source POI/text -> translate 4 segments via `ITranslationProvider`
-> if all segment translations succeeded: `UpsertTranslationCacheAsync(...)`
-> return translated merged `Poi`
-> caller injects `RegisterDynamicTranslation(code, lang, loc)`
-> caller updates `AppState.SelectedPoi` and/or `AppState.Pois`
-> UI refresh

### 2.3 QR Secure Scan to Translation Path

Camera/manual QR
-> `QrScannerViewModel.SubmitCodeAsync`
-> `PoiEntryCoordinator.HandleEntryAsync`
-> parse QR
-> if secure token: `POST pois/scan` (requires authenticated user)
-> merge server POI + inject dynamic `vi/en`
-> navigate to map/detail route
-> map/detail flow requests localization
-> if selected language still fallback and non-`vi/en`, translation may trigger via focus/narration path

---

## 3. Entry Points

### 3.1 All translation trigger entry points (`GetOrTranslateAsync`)

```id="p4fz6d"
- PoiFocusService.FocusOnPoiByCodeAsync -> GetOrTranslateAsync
- PoiNarrationService.EnsureTranslatedAsync -> GetOrTranslateAsync
- BackgroundTaskService.RunPreloaderLoopAsync -> GetOrTranslateAsync
```

### 3.2 Upstream UI triggers that can reach translation

- `MapPage.ApplyQueryAttributes(...)` -> `MapViewModel.RequestFocusOnPoiCode(...)` -> `FocusOnPoiByCodeAsync(...)` -> translation path.
- `MapPage.OnPinMarkerClicked(...)` -> `_vm.PlayPoiAsync(...)` -> narration translation path.
- `MapPage.StartTrackingAsync(...)` auto-nearest -> `_vm.PlayPoiAsync(...)` -> narration translation path.
- `PoiDetailViewModel.PlayAsync()` -> `_narrationService.PlayPoiAsync(Poi)` -> narration translation path.
- `PoiDetailViewModel.PlayDetailedAsync()` (premium) -> `_narrationService.PlayPoiDetailedAsync(Poi)` -> narration translation path.
- `QrScannerPage` camera event -> `QrScannerViewModel.HandleScannedCodeAsync(...)` -> `PoiEntryCoordinator` navigate to map/detail -> then map/detail/narration trigger translation as above.

### 3.3 Localization-only entry points (no direct API translation call)

- `PoiHydrationService.LoadPoisAsync(...)` -> `GetLocalizationResult(...)`.
- `LanguageSwitchService.ApplyLanguageSelectionAsync(...)` -> rehydrate all POIs via `GetLocalizationResult(...)`.
- `PoiDetailViewModel.LoadPoiAsync(...)` -> `GetLocalizationResult(...)`.

---

## 4. Cache Behavior

### 4.1 Cache structure

- Storage: SQLite table `poi_translation_cache` (`PoiTranslationCacheEntry`).
- Fields: `Key`, `Code`, `LanguageCode`, `Name`, `Summary`, `NarrationShort`, `NarrationLong`, `IsAutoGenerated`, `CreatedAt`.
- Primary key: `Key`.
- Key format:
  - `PoiTranslationCacheEntry.MakeKey(code, languageCode)`
  - normalized to `CODE_UPPER|lang_lower`.

### 4.2 When cache is used

- On each `PoiTranslationService.GetOrTranslateAsync(...)` call:
  - direct POI row checked first,
  - then cache lookup by `CODE|lang`.
- If cache hit:
  - cached translated text is merged with source geo POI,
  - translation provider API is not called.

### 4.3 When API is triggered

- API/provider translation path runs when:
  - direct row check misses,
  - cache miss for `CODE|lang`,
  - source POI can be resolved,
  - target language differs from source language.
- 4 segment calls are attempted:
  - `Name`, `Summary`, `NarrationShort`, `NarrationLong`.

### 4.4 Cache write policy and invalidation

- Cache write only when **all 4 segments succeed** (`allSucceeded == true`).
- Partial/failed translation returns merged POI but skips cache write.
- No TTL/expiry/invalidation logic is implemented for `poi_translation_cache`.
- `CreatedAt` is stored but not used for eviction in current flow.

---

## 5. API Behavior

### 5.1 Translation provider usage

- `ITranslationProvider` implementation registered: `LangblyTranslationProvider`.
- `LangblyTranslationProvider` has endpoint constant: `https://api.langbly.com/v1/translate`.
- Current runtime flag `_useFallbackDirectly = true` routes directly to fallback.
- Effective translation execution therefore uses `GTranslateTranslationProvider` (`GoogleTranslator.TranslateAsync(...)`) with 5s timeout handling.

### 5.2 Related API in translation-adjacent flow (QR/Auth)

- Secure QR path: `POST pois/scan` in `PoiEntryCoordinator`.
- Requires authentication (`AuthService.IsAuthenticated` guard).
- Injects server text for `vi/en` into localization memory; this is not `PoiTranslationService`, but it affects translation availability and fallback behavior.

### 5.3 Frequency / worst-case API spam scenario

- Most expensive path per POI-language miss: up to 4 segment translation calls.
- Worst-case stress pattern:
  - active non-`vi/en` language,
  - many fallback POIs not yet cached,
  - simultaneous triggers from:
    - map focus flow,
    - narration play flow,
    - background preloader loop (every 8s),
    - repeated QR/map navigation touching uncached POIs.
- Per **same key** (`CODE|lang`), `PoiTranslationService` key-gate serializes calls and prevents parallel duplicate provider calls.
- Across **different keys** (many POIs), calls can still fan out and produce high outbound provider traffic.

---

## 5.4 Language Detection & Persistence
- **Bootstrapping**: `PreferredLanguageService` ctor checks `Preferences` for `preferred_language`.
- **System Detection**: If first launch, uses `CultureInfo.CurrentUICulture.TwoLetterISOLanguageName` and defaults to `vi` if unsupported.
- **Dynamic Languages**: Custom languages added via UI are persisted as a comma-separated list in `custom_dynamic_languages`.

---

## 5.5 Language Pack & Download Management
- **State**: `LanguagePackService` tracks `NotDownloaded`, `Downloading`, `Downloaded`, `Failed`.
- **Logic**:
    - `vi` and `en` are pre-installed.
    - Other languages require "EnsureAvailableAsync" call.
- **Network Awareness**: 
    - WiFi: Silent download.
    - Cellular: User confirmation prompt.
    - Offline: Shows "Unavailable" alert.
- **Implementation**: Currently simulated (Task.Delay + memory flag) to prepare for future CDN integration.

---

## 6. Concurrency Status

### 6.1 Translation dedup and locking

- `PoiTranslationService` uses per-key lock:
  - `ConcurrentDictionary<string, SemaphoreSlim> _locks`.
  - Deduplicates concurrent requests for same `CODE|lang`.
- `PoiNarrationService` uses `_translationGate` semaphore around translation block.
- QR flow uses page/viewmodel guards:
  - `_barcodeSync`, `_cameraSubmitInProgress`, `_isHandlingScan`, and inter-frame dedupe window.

### 6.2 Localization dictionary access pattern

- `LocalizationService.RegisterDynamicTranslation(...)` writes under `lock(_lookup)`.
- `LocalizationService.GetLocalizationResult(...)` reads `_lookup` without lock.
- Runtime docs also flag this as potential inconsistency.

### 6.3 Required explicit status

```id="y96krr"
❌ Duplicate requests possible: YES (across different keys/POIs; same-key duplicates are guarded)
❌ Thread-safe: PARTIAL / NO (per-key translation path is guarded, but localization dictionary read/write synchronization is inconsistent)
❌ Risk level: MEDIUM
```

---

## 7. Risk Assessment

Observed risks (current behavior only):

```id="84zh9x"
1. Repository contract mismatch: `GetExactByCodeAndLanguageAsync` in local SQLite repo delegates to `GetByCodeAsync` without language filtering.
2. Translation source inconsistency: source text is forced from in-memory `vi` lookup when available, while docs mention EN preference; behavior depends on available in-memory data.
3. Partial thread-safety in `LocalizationService`: writes are locked, reads are not synchronized.
4. No translation cache invalidation/expiry for `poi_translation_cache`; stale entries can persist indefinitely.
5. Multiple independent translation triggers (focus, narration, background preloader) can increase provider load under non-vi/en stress.
6. QR secure path injects dynamic `vi/en` translations directly; this can diverge from provider-based translation cache lifecycle.
7. Mixed text sources (`pois.json`, dynamic injection, translation cache, server sync) increase state divergence risk across flows.
```

---

## 8. Per-Entry Detailed Sequence Flows

### 8.1 Map focus flow

User navigates/focuses POI on map  
-> `MapPage` requests focus  
-> `PoiFocusService.FocusOnPoiByCodeAsync`  
-> `LocalizationService.GetLocalizationResult`  
-> if fallback + language not `vi/en` -> `PoiTranslationService.GetOrTranslateAsync`  
-> cache/API path  
-> `RegisterDynamicTranslation`  
-> hydrate POI  
-> set `AppState.SelectedPoi`  
-> map UI panel/pin text updates

### 8.2 Narration flow

User taps play (map or detail)  
-> `PoiNarrationService.PlayPoiAsync/PlayPoiDetailedAsync`  
-> `EnsureTranslatedAsync`  
-> `GetLocalizationResult`  
-> if fallback + non-`vi/en`: serialized translation block (`_translationGate`)  
-> `PoiTranslationService` cache/API path  
-> `RegisterDynamicTranslation`  
-> `SyncUiAsync` updates `SelectedPoi` and collection item  
-> TTS speaks localized narration

### 8.3 Background preloader flow

Background loop (8s)  
-> choose first fallback POI in current non-`vi/en` language  
-> `PoiTranslationService.GetOrTranslateAsync`  
-> `RegisterDynamicTranslation`  
-> replace POI in `AppState.Pois` with hydrated localized instance  
-> future UI reads hit localized in-memory data

### 8.4 QR secure flow

Camera/manual scan  
-> `QrScannerViewModel` submits request  
-> `PoiEntryCoordinator` parses payload  
-> secure token path calls `POST pois/scan` (auth required)  
-> upsert core POI locally + inject `vi/en` dynamic localization  
-> navigate to map/detail with query params  
-> map/detail + narration/focus continue translation logic as needed

---

## 9. Notes on Documentation vs Code Consistency

Documents and code both indicate:

- Translation cache key is `CODE|lang`.
- Key-based anti-duplicate translation locking exists.
- Translation cache uses SQLite table `poi_translation_cache`.
- Local repository language-filter contract mismatch is known.

Current verified behavior to prioritize for any future patch work:

- Direct row language check in local repo is not semantically exact.
- Effective translation provider path currently resolves through GTranslate fallback due to `_useFallbackDirectly = true`.
- Translation behavior is spread across multiple trigger points, not just one centralized UI action.
