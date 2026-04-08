# QR_PAYLOAD_SAMPLES

Short reference of sample QR payloads used for testing and demos.

## Supported payloads (scanned inside app)
- `poi:HO_GUOM`  -> normalized to `HO_GUOM`
- `poi://HO_GUOM` -> normalized to `HO_GUOM`
- `HO_GUOM` (plain code) -> normalized to `HO_GUOM`
- `https://example.com/poi/HO_GUOM` -> parsed path `/poi/HO_GUOM`, normalized to `HO_GUOM`
- `https://example.com/p/HO_GUOM` -> parsed path `/p/HO_GUOM`, normalized to `HO_GUOM`

## Unsupported / out-of-scope payloads (current)
- OS-level deep link payloads that require intent-filters or universal links (not handled by app registration in this phase)
- Arbitrary query-based URLs (e.g. `https://example.com/?code=HO_GUOM`) — not parsed by current resolver
- Non-alphanumeric codes containing spaces or unexpected separators

## Sample valid codes
- `HO_GUOM`
- `ND_TEMPLE_01`
- `DA_NANG_BRIDGE`

Normalization rules:
- Trim whitespace
- Convert to uppercase using `ToUpperInvariant()`
- Do not accept empty code

## Sample invalid codes
- `` (empty string)
- ` ` (whitespace)
- `HO GUOM` (contains space)
- `poi:/` (no code)
- `https://example.com/poi/` (missing code segment)

## Notes
- Parser performs simple normalization only: `Trim()` + `ToUpperInvariant()`.
- Link-based payloads are parsed only when the scanner provides the raw URL string (i.e., scanned inside the app). OS-level URL routing is planned for future phases.
