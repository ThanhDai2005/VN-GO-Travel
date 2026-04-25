# 4. Activity - Translation And Localization

## Scope
- Cách nội dung ngôn ngữ được chọn, fallback, và dịch động.

## Step-by-step Activity

1. App init `LocalizationService` từ `pois.json`.

> *Vị trí: `LocalizationService` nằm ở file `Services/LocalizationService.cs`, dòng `29`*
2. Tạo dictionary `(Code, Lang)` -> localization.
3. Khi load POI:
   - lấy core POI từ SQLite.
   - hydrate text qua `GetLocalizationResult(code, targetLang)`.
4. Fallback chain:
   - ưu tiên ngôn ngữ yêu cầu.
   - fallback `vi`.
   - fallback “first available language”.
5. Nếu cần dịch động (`PoiTranslationService.GetOrTranslateAsync`):
   - check direct row (API contract hiện tại, thực tế không lọc lang trong SQLite core).
   - check `poi_translation_cache`.
   - nếu miss: lấy source text (ưu tiên vi), gọi translator.
   - nếu dịch thành công toàn phần: ghi cache.
6. Inject dynamic translation vào `LocalizationService` để UI đọc ngay.

> *Vị trí: `LocalizationService` nằm ở file `Services/LocalizationService.cs`, dòng `29`*

## Key Decisions/Conditions

- Translation cache key chuẩn hóa `CODE|lang`.
- Lock theo key để chống dịch trùng đồng thời.
- Chỉ cache khi tất cả segment dịch thành công.

## Known Imperfections

- `LocalizationService` lock khi ghi nhưng đọc lookup không lock đồng bộ hoàn toàn.

> *Vị trí: `LocalizationService` nằm ở file `Services/LocalizationService.cs`, dòng `29`*
- Hàm `GetExactByCodeAndLanguageAsync` tại repository hiện không thực hiện language filter như tên hàm.
