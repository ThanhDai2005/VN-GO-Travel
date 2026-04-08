# QR_SEQUENCE_FUTURE

Planned flow for future external / OS-level deep link support. THIS IS PLANNED ONLY — not implemented in code.

## Goals
- Allow external device camera scans (or web links) to open the app to the correct POI when app is installed
- Provide a landing page for users without the app
- Support deferred deep linking when user installs the app

## High-level branches

1) External camera / web link and app installed
- User scans a public QR (URL) with device camera
- Device opens `https://example.com/poi/HO_GUOM`
- OS resolves configured App Link / Universal Link -> open app
- App receives URL in platform entry-point -> `DeepLinkHandler`
- `DeepLinkHandler` extracts `Code` using the same logic as `QrResolver`
- App performs `PoiDatabase.GetByCodeAsync(code)` -> open `PoiDetailPage`

2) External camera / web link and app NOT installed
- User scans URL -> browser opens landing page
- Landing page can show POI summary and buttons to install app
- Optionally support deferred deep link: after install, pass original `Code` to app to open the same POI

3) Deferred deep linking (optional advanced)
- Landing page stores deep-link token
- After install, app receives token and exchanges with server to get `Code` and opens POI

## Notes & constraints
- Platform integration requires adding intent-filters / assetlinks (Android) and universal links (iOS) — these are out-of-scope for current phase
- `DeepLinkHandler` should reuse `QrResolver` parsing logic to avoid duplication
- Security considerations: avoid open redirects; validate code tokens before use

## Recommended steps when implementing
1. Define `DeepLinkHandler` contract and platform entry points
2. Add unit tests and e2e tests for device-level flows
3. Provide a simple landing page stub for manual testing
4. Reuse parser + DB lookup logic already present in app


*This document intentionally marks the flow as planned only; do not claim it as implemented.*