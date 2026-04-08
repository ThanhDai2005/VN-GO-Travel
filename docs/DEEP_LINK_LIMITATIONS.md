# Deep link limitations (project notes)

**Contract + tests:** See **`docs/QR_MODULE.md`** (frozen baseline and regression checklist).

Short note for developers and QA about current deep-link capabilities and known limitations.

## Supported now (guaranteed)
- Normal app launch from icon: stable
- In-app QR scanning and manual QR code entry: stable
- POI resolution and opening inside the app: stable
- Warm-start deep link handling (when app already running or backgrounded): supported where MAUI UI is active and a warm intent is received

## Deferred / known limitation
- Android cold-start deep link reliability: DEFERRED
  - When the app is fully closed and a user opens a https app link (e.g. `https://thuyetminh.netlify.app/poi/{CODE}`) the behavior is not guaranteed in this phase.
  - The app will store the incoming link but handling on cold start is treated as a best-effort / known limitation.

## Fallback for users
- If a user cannot open a POI via an external link because the app was not running, instruct them to:
  1. Open the app from the icon
  2. Use the QR scanner in-app or enter the code manually

## Technical reason
- MAUI Android startup lifecycle timing requires a later hardening pass to ensure navigation only occurs after Shell and navigation stack are fully initialized. To avoid startup instability, cold-start deep-link handling is deferred to a future phase.

## Future phase notes
- Plan: unify store/consume flow with a dedicated startup coordinator, investigate MAUI lifecycle hooks (CreateWindow/Loaded), and add a robust single-source-of-truth consumer that tolerates cold start.
- Warm/background handling is implemented via `DeepLinkCoordinator` (see `QR_MODULE.md`).
