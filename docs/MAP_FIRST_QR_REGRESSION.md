# Map-first QR — regression checklist

**Invariant:** All POI entry remains `PoiEntryCoordinator.HandleEntryAsync` (QR camera, manual, deep link).

**Navigation modes:** `PoiNavigationMode.Detail` (default) vs `PoiNavigationMode.Map` (QR camera only in current product defaults).

---

## Mandatory verification

1. **QR scan opens Map (not Detail)** — Camera scan valid code → Shell shows Map tab, map centers POI, bottom panel visible.
2. **Map focuses correct POI** — Pin/region matches `code` from query; `CurrentPoiStore` already set by coordinator.
3. **No duplicate navigation** — Rapid double scan still suppressed by coordinator dedupe (`Navigated = false` path unchanged).
4. **Invalid QR** — Parse errors still surface in scanner UX; no navigation.
5. **POI not found** — Same as before; coordinator returns failure.
6. **Manual input** — Still opens **PoiDetail** (`NavigationMode` default `Detail`).
7. **Deep link** — Still opens **PoiDetail** (request default `Detail`; `DeepLinkHandler` unchanged).
8. **PoiDetail route** — `/poidetail?...` still works; from Map, **Xem chi tiết địa điểm** opens detail.
9. **Invalid map query** — Unknown `code` → no crash; narrate flag cleared; panel may stay hidden.
10. **Audio** — With `narrate=1`, short narration plays once after focus; tracking loop skips auto-play while `_isUserSelecting` is true; no double fire from geofence in that state.

---

## Coordinator routes (reference)

| Mode   | Route pattern |
|--------|----------------|
| Detail | `/poidetail?code=&lang=` |
| Map    | `//map?code=&lang=` + `&narrate=1` when `Source == Scanner` |
