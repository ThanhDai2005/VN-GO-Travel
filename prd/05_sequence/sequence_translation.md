# 5. Sequence - Translation

## Participants
- Actor: Tourist/User (ngầm qua chọn ngôn ngữ)
- View/ViewModel: `MapPage` / `MapViewModel`, `PoiDetailViewModel`

> *Vị trí: `MapPage` nằm ở file `Views/MapPage.xaml.cs`, dòng `38`*
> *Vị trí: `MapViewModel` nằm ở file `ViewModels/MapViewModel.cs`, dòng `56`*
> *Vị trí: `PoiDetailViewModel` nằm ở file `ViewModels/PoiDetailViewModel.cs`, dòng `35`*
- Services: `LocalizationService`, `PoiHydrationService`, `PoiTranslationService`

> *Vị trí: `LocalizationService` nằm ở file `Services/LocalizationService.cs`, dòng `29`*
> *Vị trí: `PoiHydrationService` nằm ở file `Services/PoiHydrationService.cs`, dòng `35`*
> *Vị trí: `PoiTranslationService` nằm ở file `Services/PoiTranslationService.cs`, dòng `28`*
- Database: SQLite (`pois`, `poi_translation_cache`)
- In-memory data: localization lookup dictionary
- External API: translation provider (qua `ITranslationProvider`)

## Main Sequence (Hydration/Fallback)

1. ViewModel yêu cầu load POIs theo target language.
2. `PoiHydrationService` lấy core POIs từ SQLite.

> *Vị trí: `PoiHydrationService` nằm ở file `Services/PoiHydrationService.cs`, dòng `35`*
3. Mỗi POI gọi `LocalizationService.GetLocalizationResult(code, lang)`.
4. Service áp dụng fallback chain:
   - requested lang
   - `vi`
   - any available
5. Hydrated list đẩy vào `AppState.Pois`.

## Sequence (Auto-translate Path)

1. Hệ thống yêu cầu `PoiTranslationService.GetOrTranslateAsync(code, targetLang)`.
2. Check direct row + cache key `CODE|lang`.
3. Nếu cache miss:
   - lấy source text (thực tế ưu tiên vi từ in-memory).
   - gọi translator cho name/summary/narration short/long.
4. Nếu toàn bộ segment success -> upsert `poi_translation_cache`.
5. Merge thành POI object có localization đích.
6. Inject dynamic translation vào `LocalizationService`.

> *Vị trí: `LocalizationService` nằm ở file `Services/LocalizationService.cs`, dòng `29`*

## Thread Context

- DB query/cache: background.
- Dictionary lookup: sync runtime.
- Translation API: background async.
- AppState collection update: MainThread.

## Race Conditions / Inconsistencies

- Lookup dictionary đọc không lock toàn phần trong khi ghi có lock.
- Contract “exact by code and language” ở repository không lọc language thực, nên một số nhánh logic service có thể hiểu sai khả năng DB.
- Dữ liệu text hiện phân mảnh giữa `pois.json`, in-memory dynamic injection, và translation cache.
