# 6. Class Diagram (Textual Pre-UML)

## 6.1 Class Grouping

## ViewModels
- `MapViewModel`

> *Vị trí: `MapViewModel` nằm ở file `ViewModels/MapViewModel.cs`, dòng `56`*
- `QrScannerViewModel`

> *Vị trí: `QrScannerViewModel` nằm ở file `ViewModels/QrScannerViewModel.cs`, dòng `53`*
- `PoiDetailViewModel`

> *Vị trí: `PoiDetailViewModel` nằm ở file `ViewModels/PoiDetailViewModel.cs`, dòng `35`*
- `LanguageSelectorViewModel`

> *Vị trí: `LanguageSelectorViewModel` nằm ở file `ViewModels/LanguageSelectorViewModel.cs`, dòng `47`*

## Services
- State/Navigation:
  - `AppState`
  - `NavigationService`

> *Vị trí: `NavigationService` nằm ở file `Services/NavigationService.cs`, dòng `17`*
  - `DeepLinkCoordinator`

> *Vị trí: `DeepLinkCoordinator` nằm ở file `Services/DeepLinkCoordinator.cs`, dòng `21`*
- POI domain:
  - `PoiHydrationService`

> *Vị trí: `PoiHydrationService` nằm ở file `Services/PoiHydrationService.cs`, dòng `35`*
  - `PoiEntryCoordinator`

> *Vị trí: `PoiEntryCoordinator` nằm ở file `Services/PoiEntryCoordinator.cs`, dòng `39`*
  - `PoiFocusService`

> *Vị trí: `PoiFocusService` nằm ở file `Services/PoiFocusService.cs`, dòng `34`*
  - `PoiNarrationService`

> *Vị trí: `PoiNarrationService` nằm ở file `Services/PoiNarrationService.cs`, dòng `42`*
  - `GeofenceService`

> *Vị trí: `GeofenceService` nằm ở file `Services/GeofenceService.cs`, dòng `30`*
  - `PoiTranslationService`

> *Vị trí: `PoiTranslationService` nằm ở file `Services/PoiTranslationService.cs`, dòng `28`*
  - `LocalizationService`

> *Vị trí: `LocalizationService` nằm ở file `Services/LocalizationService.cs`, dòng `29`*
  - `PoiDatabase`

> *Vị trí: `PoiDatabase` nằm ở file `Services/PoiDatabase.cs`, dòng `15`*
- Infra/service wrappers:
  - `ApiService`

> *Vị trí: `ApiService` nằm ở file `Services/ApiService.cs`, dòng `16`*
  - `AuthService`

> *Vị trí: `AuthService` nằm ở file `Services/AuthService.cs`, dòng `28`*
  - `AudioService`
  - `DeviceLocationService`

## Models
- Mobile:
  - `Poi`
  - `PoiLocalization`
  - `PoiTranslationCacheEntry`
  - `LocalizationResult`
  - `QrParseResult`
  - `PoiEntryRequest` / `PoiEntryResult`
- Backend:
  - `Poi` (mongoose model)
  - `PoiRequest`
  - `AdminPoiAudit`
  - `User`

## Coordinators
- `PoiEntryCoordinator` (QR/deep-link entry orchestration)

> *Vị trí: `PoiEntryCoordinator` nằm ở file `Services/PoiEntryCoordinator.cs`, dòng `39`*
- `DeepLinkCoordinator` (Android intent -> app flow dispatch)

> *Vị trí: `DeepLinkCoordinator` nằm ở file `Services/DeepLinkCoordinator.cs`, dòng `21`*

## 6.2 Core Relationships (Dependency / Composition / Data Flow)

- `MapPage` -> `MapViewModel` (UI binding)

> *Vị trí: `MapPage` nằm ở file `Views/MapPage.xaml.cs`, dòng `38`*
> *Vị trí: `MapViewModel` nằm ở file `ViewModels/MapViewModel.cs`, dòng `56`*
- `MapViewModel` -> `PoiHydrationService`, `PoiNarrationService`, `PoiFocusService`, `LanguageSwitchService`, `GeofenceService`, `AppState`

> *Vị trí: `MapViewModel` nằm ở file `ViewModels/MapViewModel.cs`, dòng `56`*
> *Vị trí: `PoiHydrationService` nằm ở file `Services/PoiHydrationService.cs`, dòng `35`*
> *Vị trí: `PoiNarrationService` nằm ở file `Services/PoiNarrationService.cs`, dòng `42`*
> *Vị trí: `PoiFocusService` nằm ở file `Services/PoiFocusService.cs`, dòng `34`*
> *Vị trí: `LanguageSwitchService` nằm ở file `Services/LanguageSwitchService.cs`, dòng `39`*
> *Vị trí: `GeofenceService` nằm ở file `Services/GeofenceService.cs`, dòng `30`*
- `PoiHydrationService` -> `IPoiQueryRepository`/`IPoiCommandRepository` (`PoiDatabase`), `LocalizationService`, `ApiService`, `AuthService`

> *Vị trí: `PoiHydrationService` nằm ở file `Services/PoiHydrationService.cs`, dòng `35`*
> *Vị trí: `PoiDatabase` nằm ở file `Services/PoiDatabase.cs`, dòng `15`*
> *Vị trí: `LocalizationService` nằm ở file `Services/LocalizationService.cs`, dòng `29`*
> *Vị trí: `ApiService` nằm ở file `Services/ApiService.cs`, dòng `16`*
> *Vị trí: `AuthService` nằm ở file `Services/AuthService.cs`, dòng `28`*
- `PoiTranslationService` -> repositories + translator + `LocalizationService`

> *Vị trí: `PoiTranslationService` nằm ở file `Services/PoiTranslationService.cs`, dòng `28`*
> *Vị trí: `LocalizationService` nằm ở file `Services/LocalizationService.cs`, dòng `29`*
- `GeofenceService` -> `AppState` + `IAudioPlayerService`

> *Vị trí: `GeofenceService` nằm ở file `Services/GeofenceService.cs`, dòng `30`*
- `QrScannerViewModel` -> `PoiEntryCoordinator` + `NavigationService`

> *Vị trí: `QrScannerViewModel` nằm ở file `ViewModels/QrScannerViewModel.cs`, dòng `53`*
> *Vị trí: `PoiEntryCoordinator` nằm ở file `Services/PoiEntryCoordinator.cs`, dòng `39`*
> *Vị trí: `NavigationService` nằm ở file `Services/NavigationService.cs`, dòng `17`*
- `PoiEntryCoordinator` -> QR parser/service + local repositories + API + navigation + app state

> *Vị trí: `PoiEntryCoordinator` nằm ở file `Services/PoiEntryCoordinator.cs`, dòng `39`*
- `NavigationService` -> `Shell` + `AppState` modal state

> *Vị trí: `NavigationService` nằm ở file `Services/NavigationService.cs`, dòng `17`*

Backend side:
- Route/controller -> `poi.service.js`
- `poi.service.js` -> repositories/models + cache + audit service
- repositories -> Mongo models

## 6.3 God Classes / Tight Coupling Areas

## God-class tendencies
- `backend/src/services/poi.service.js`:
  - chứa quá nhiều trách nhiệm: CRUD, validation, moderation, mapping DTO, scan token, quota, caching.
- `MapPage.xaml.cs`:
  - UI rendering + tracking loop + auto-select logic + audio trigger + sync continuation.
- `MapViewModel` (giai đoạn hiện tại là "heavy coordinator", chưa hoàn toàn god-class):

> *Vị trí: `MapViewModel` nằm ở file `ViewModels/MapViewModel.cs`, dòng `56`*
  - đã tách bớt trách nhiệm ra services, nhưng vẫn là điểm hội tụ nhiều dependency và event wiring.

## Tight coupling points
- `MapViewModel` vẫn phụ thuộc nhiều service và AppState event wiring.

> *Vị trí: `MapViewModel` nằm ở file `ViewModels/MapViewModel.cs`, dòng `56`*
- QR flow lock chain (VM -> coordinator -> navigation) phức tạp, khó quan sát lỗi race.
- Dữ liệu localization phân tầng (json/in-memory/cache) làm tăng coupling logic đọc nội dung.

## 6.4 Suggested Diagram Segments For Mermaid Class Diagram

Khi vẽ UML:
- Segment A: `Views` <-> `ViewModels`.
- Segment B: `ViewModels` -> `Services`.
- Segment C: `Services` -> `Repositories` -> `SQLite/Mongo`.
- Segment D: `Coordinator` interactions (`PoiEntryCoordinator`, `DeepLinkCoordinator`).

> *Vị trí: `PoiEntryCoordinator` nằm ở file `Services/PoiEntryCoordinator.cs`, dòng `39`*
> *Vị trí: `DeepLinkCoordinator` nằm ở file `Services/DeepLinkCoordinator.cs`, dòng `21`*

Nên đánh dấu stereotype:
- `<<god-class>>` cho `PoiService` (backend) và `MapPage` (mobile UI code-behind).

> *Vị trí: `MapPage` nằm ở file `Views/MapPage.xaml.cs`, dòng `38`*
- `<<high-coupling>>` cho `MapViewModel`.

> *Vị trí: `MapViewModel` nằm ở file `ViewModels/MapViewModel.cs`, dòng `56`*
