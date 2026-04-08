# QR_TEST_MATRIX

A concise test matrix for QR parsing and app behavior.

Columns: Case ID | Input | Expected Parse Result | Expected App Behavior | Current Status | Notes

1 | `poi:HO_GUOM` | Success: Code=`HO_GUOM` | Open `PoiDetailPage` for `HO_GUOM` | Implemented | Normalization -> uppercase
2 | `poi://HO_GUOM` | Success: Code=`HO_GUOM` | Open `PoiDetailPage` | Implemented | Ensure parse order checks `poi://` first
3 | `HO_GUOM` | Success: Code=`HO_GUOM` | Open `PoiDetailPage` | Implemented | Plain code fallback
4 | `https://example.com/poi/HO_GUOM` | Success: Code=`HO_GUOM` | Open `PoiDetailPage` | Implemented (in-app scanner) | Parsed from URL path segments
5 | `https://example.com/p/HO_GUOM` | Success: Code=`HO_GUOM` | Open `PoiDetailPage` | Implemented (in-app scanner) | Parsed from URL path segments
6 | `https://example.com/poi/` | Failure: Code empty | Show parse error `Code is empty in URL path` | Implemented | Edge-case: missing segment
7 | `poi:` | Failure: Code empty | Show parse error `Code is empty` | Implemented | Edge-case: missing code after prefix
8 | `garbage://data` | Failure: Unrecognized format | Show parse error `Unrecognized QR format` | Implemented | Unsupported scheme
9 | `HO_GUOM` but Code not in DB | Success parse; lookup fails | Show `POI not available locally` (no navigation) | Implemented | DB lookup behavior
10 | Rapid repeated scans (same payload) | First parse success, subsequent suppressed | Only one navigation to detail; double-navigation prevented | Implemented | Debounce/cooldown required
11 | Scan then Open on Map | NA | From `PoiDetailPage` press Open on Map -> Map focuses POI without extra pushes | Implemented | Map pending focus flow

Notes:
- "Implemented (in-app scanner)" means parser supports the case when the scanned string is passed through the app scanner. OS-level URL routing is not covered here.
- For tests requiring local DB, ensure `PoiDatabase` contains matching `Code` entries.
- Add platform deep-link tests in future phases when intent-filters / universal links are implemented.
