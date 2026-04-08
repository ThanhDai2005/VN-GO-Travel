# QR module — frozen baseline (v1)

**Status:** Baseline locked for regression before optional enhancements (e.g. APK download for users without the app).

**Canonical spec:** This file is the single source of truth for the QR + web + deep-link contract. Older docs under `docs/` may retain historical wording; prefer this document when testing or changing behavior.

---

## 1. Public URL contract

| Item | Value |
|------|--------|
| **Public host** | `thuyetminh.netlify.app` |
| **Canonical POI URL** | `https://thuyetminh.netlify.app/poi/{CODE}` |
| **Short path variant (app + parser)** | `https://thuyetminh.netlify.app/p/{CODE}` — accepted by **Android intent filters** and by **`QrResolver`** when the payload is a full URL (e.g. scanned in-app). **Web landing** is implemented only for `/poi/{CODE}`. |

- **Direct load, refresh, share:** Netlify serves `index.html` for `/poi/*` (see `web/netlify.toml`) so the client router can read `CODE` from the path.
- **POI data on web:** `web/pois.json` (keep in sync with `Resources/Raw/pois.json` when POIs change).

---

## 2. POI code normalization (single ruleset)

All entry paths converge on **`QrResolver.Parse`** inside **`PoiEntryCoordinator.HandleEntryAsync`** (and the same parser is used for dedupe keys in the scanner).

- Trim, then **uppercase invariant** for the final `Code`.
- Supported raw shapes include: `poi:CODE`, `poi://CODE`, plain token (letters/digits/`_`/`-`), and absolute `http(s)://…/poi/CODE` or `…/p/CODE`.

**Web (`web/pois.js`):** `normalizePoiCode` mirrors uppercase + trim for lookup against `pois.json`.

---

## 3. Web → app handoff

| Platform | Behavior |
|----------|-----------|
| **Android** | Primary: **intent URL** to `intent://thuyetminh.netlify.app/poi/{CODE}#Intent;scheme=https;package=com.companyname.mauiapp1;…;S.browser_fallback_url={current page URL};end` (see `web/app.js`). |
| **Other** | Navigates to `https://thuyetminh.netlify.app/poi/{CODE}`. |

**Fallback:** If the app does not open, the browser should return to the current POI page (`S.browser_fallback_url`). The page shows a short guidance banner after tap; content remains usable (copy code, home link).

---

## 4. Android app link acceptance

**File:** `Platforms/Android/MainActivity.cs`

- `Intent.ActionView`, `https`, host **`thuyetminh.netlify.app`**, path prefixes **`/poi/`** and **`/p/`**.
- Intents are forwarded to **`PendingDeepLinkStore`** + **`DeepLinkCoordinator`** → **`DeepLinkHandler`** → **`PoiEntryCoordinator`** (same navigation path as in-app QR when possible).

**Cold start:** See `docs/DEEP_LINK_LIMITATIONS.md` (warm/background prioritized; cold start deferred/hardening).

---

## 5. In-app QR flow (coordinator = single entry)

- **UI:** `Views/QrScannerPage.*` + `ViewModels/QrScannerViewModel.cs`
- **Pipeline:** Scanner / manual / deep link → **`PoiEntryCoordinator`** → `QrResolver` → DB → **`Shell` navigation** (mode chosen via `PoiEntryRequest.NavigationMode`).
- **Map-first (default for QR camera):** `NavigationMode.Map` → `//map?code=&lang=&narrate=1`; `MapPage` implements `IQueryAttributable`, calls `MapViewModel.RequestFocusOnPoiCode`, optional one-shot `PlayPoiAsync` when `narrate=1`.
- **Detail-first (manual + deep links):** default `NavigationMode.Detail` → `/poidetail?code=&lang=`. From map, **Xem chi tiết địa điểm** opens detail.
- **Regression:** `docs/MAP_FIRST_QR_REGRESSION.md`

---

## 6. Files involved (quick map)

| Area | Files |
|------|--------|
| Parser | `Services/QrResolver.cs` |
| POI open / nav | `Services/PoiEntryCoordinator.cs` |
| External link app-side | `Services/DeepLinkHandler.cs`, `Services/DeepLinkCoordinator.cs`, `Services/PendingDeepLinkStore.cs` |
| Android intake | `Platforms/Android/MainActivity.cs` |
| Shell / resume | `AppShell.xaml.cs`, `App.xaml.cs` |
| In-app QR | `Views/QrScannerPage.xaml(.cs)`, `ViewModels/QrScannerViewModel.cs` |
| Navigation mode | `Models/PoiNavigationMode.cs`, `Models/PoiEntryRequest.cs` |
| Map query handling | `Views/MapPage.xaml(.cs)`, `ViewModels/MapViewModel.cs` |
| Web | `web/index.html`, `web/app.js`, `web/pois.js`, `web/pois.json`, `web/styles.css`, `web/netlify.toml` |

---

## 7. Regression checklist (exact cases)

Run on a **release or debug build** with intent filters matching this doc. Use **Netlify base URL** for all external link tests.

| # | Case | Steps | Expected |
|---|------|--------|----------|
| R1 | **Direct POI page load** | Open `https://thuyetminh.netlify.app/poi/HO_GUOM` | POI name + summary (vi preferred); no blank page. |
| R2 | **Refresh** | On a valid POI URL, refresh | Same POI; route still works (Netlify rewrite). |
| R3 | **Not found** | Open `/poi/UNKNOWN_CODE` | Clean not-found state; link home. |
| R4 | **Open in app (Android)** | On POI page, tap **Mở trong ứng dụng** | App opens (or chooser); if no app, fallback URL keeps web usable. |
| R5 | **Fallback if app does not open** | Device without app or intent declines | Returns to web POI page; banner + copy/home still work. |
| R6 | **Physical QR → web** | QR encodes `https://thuyetminh.netlify.app/poi/{CODE}` | Browser opens landing; same as R1. |
| R7 | **Web → app POI handoff** | After R4, app shows correct POI detail for same `CODE` | Navigation matches code on page. |
| R8 | **In-app QR camera** | Tab QR, scan valid `poi:CODE` or Netlify URL | Single open flow; no duplicate stacks (existing UX guards). |
| R9 | **In-app manual** | Enter `poi:CODE`, submit | Same as R8. |
| R10 | **ADB VIEW (warm)** | App running, `adb shell am start -a android.intent.action.VIEW -d "https://thuyetminh.netlify.app/poi/HO_GUOM" com.companyname.mauiapp1` | Deep link consumed; POI opens (warm path). |
| R11 | **Short path `/p/`** | ADB or scan `https://thuyetminh.netlify.app/p/HO_GUOM` in app / external | App accepts per intent filter + `QrResolver` (web landing may not exist for `/p/` — app-only). |

**Log prefixes (debug):** `[DL-ACT]`, `[DL-DISPATCH]`, `[DL-NAV]`, `[QR-SCAN]`, `[QR-STATE]`, `[QR-NAV]`, `[WEB-POI]` (browser console on web).

---

## 8. Maintenance

- **Data sync:** After editing `Resources/Raw/pois.json`, copy to `web/pois.json` before web deploy.
- **Package / host changes:** Update `ApplicationId` / package in `web/app.js` (`ANDROID_PACKAGE`) and `MainActivity` intent filters together.

---

## 9. Out of scope for this baseline

- APK / Play Store download CTA on the web page
- iOS Universal Links / `apple-app-site-association`
- Full Android App Links verification (`assetlinks.json`) — optional for smoother “open in app” without chooser
