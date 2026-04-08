# QR implementation status

**Frozen baseline:** See **`docs/QR_MODULE.md`** for the authoritative URL contract, handoff behavior, file map, and **regression checklist**.

## Snapshot

- **In-app QR** (camera + manual) → `PoiEntryCoordinator` → `QrResolver` → DB → `PoiDetailPage`: **stable**
- **Android https links** for `thuyetminh.netlify.app` paths `/poi/` and `/p/` → `DeepLinkCoordinator` → same coordinator pipeline: **stable (warm / background)**
- **Web landing** `/poi/{CODE}` on Netlify + **Open in app** (Android intent URL + fallback): **stable**
- **Cold-start deep link:** still best-effort / deferred — see **`docs/DEEP_LINK_LIMITATIONS.md`**

## Parser (`QrResolver`)

- `poi:CODE`, `poi://CODE`, plain code, and `https://…/poi/CODE` or `…/p/CODE` (absolute URL)

## Historical notes

Older files (`09_qr_strategy.md`, `QR_SEQUENCE_*.md`, `COPILOT_QR_IMPLEMENTATION_PROMPT.md`, etc.) may mention placeholder hosts or pre-landing scope; do not use them as the runtime contract.
