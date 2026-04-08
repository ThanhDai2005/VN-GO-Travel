# Phase 6 Plan — Entry pipeline stabilization

Goal: continue Phase 6 without relying on Android cold-start deep links. Stabilize and unify POI entry flows and keep the codebase ready for a later cold-start fix.

Summary of actions taken in Phase 6:

- Centralized entry pipeline: all safe entry sources converge to `PoiEntryCoordinator`.
  - QR scanner -> `QrScannerViewModel` -> `PoiEntryCoordinator`
  - Manual input -> `QrScannerViewModel` -> `PoiEntryCoordinator`
  - Warm deep link -> `MainActivity` store (isWarm=true) -> `AppShell` consumer -> `DeepLinkHandler` -> `PoiEntryCoordinator`

- Cold-start deep link is a known limitation and is deferred.
  - `MainActivity` stores incoming link with metadata (isWarm=false for OnCreate).
  - `AppShell` only consumes warm links automatically; cold links are deferred for a future dedicated startup coordinator.

- Added diagnostic logs and TODO comments to make future work easier.

Next steps (Phase 7 candidate):

1. Implement a robust startup coordinator that monitors MAUI lifecycle (CreateWindow / Loaded) and safely consumes pending cold links exactly once.
2. Add integration tests (device/emulator) for cold-start behavior and ensure deterministic handling.
3. Consider server-assisted deferred deep-links if required (token exchange) and implement assetlinks/universal-links for production.

Developer note: this plan favors stability and makes cold-start handling simpler to implement later by keeping the store/consumer centralized and well-logged.
