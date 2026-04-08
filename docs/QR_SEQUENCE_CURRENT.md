# QR Sequence — Current (in-app scanner)

This document describes the exact in-app scanner sequence implemented in code.

## Summary (success path)
- User opens `QrScannerPage` in the app
- Camera detector reads a QR payload (string)
- `QrScannerViewModel` calls `QrResolver.Parse(payload)`
- `QrResolver` extracts and normalizes `Code` (supports `poi://`, `poi:`, plain token, and URL path `/poi/{CODE}` or `/p/{CODE}`)
- `QrScannerViewModel` calls `PoiDatabase.GetByCodeAsync(code)`
- If POI exists locally -> navigate once to `PoiDetailPage`
- User may `Open on Map` (requests `MapViewModel` focus) or play narration

## Sequence (text)
1. User -> MapPage: tap open scanner
2. MapViewModel -> navigate to `QrScannerPage`
3. `QrScannerPage` requests camera permission and starts detection
4. Camera returns raw string payload to `QrScannerViewModel`
5. `QrScannerViewModel` -> `QrResolver.Parse(payload)`
6. `QrResolver` parsing order:
   - check `poi://` prefix
   - else check `poi:` prefix
   - else if absolute `http(s)` URL -> split `AbsolutePath` and look for `poi` or `p` segment followed by code
   - else if plain token (alphanumeric + `_`/`-`) -> accept
   - else return parse error
7. `QrResolver` normalizes (`Trim()` + `ToUpperInvariant()`) and returns `QrParseResult`
8. If parse success -> viewmodel calls `PoiDatabase.GetByCodeAsync(code)`
9. If POI found -> viewmodel navigates (single push) to `PoiDetailPage`

## Error / invalid paths
- Parse failure: show invalid QR message, remain on scanner
- Parse success but POI not in local DB: show `POI not available locally`

## Notes
- Parser normalization and link-path parsing are performed inside the app scanner flow. There is no OS-level app link registration in this phase.
- Navigation includes debounce/double-navigation prevention to avoid duplicate pushes on rapid scans.
