# Runtime conflict resolution report (7.2)

## Scope

Runtime-only stabilization for MAUI. **Out of scope:** ContractDefinition, Contracts.Generated, ContractObservability (6.7.1–6.7.6), schema, CI generators, replay journal.

---

## Identified runtime conflicts

| Conflict | Symptom / risk | Subsystem |
|----------|----------------|-----------|
| Non-async-safe “busy” flag | Two `HandleEntryAsync` calls could overlap across `await` | `PoiEntryCoordinator` |
| Duplicate mutation before duplicate check | `SetSelectedPoiByCode` ran even when navigation was suppressed | `PoiEntryCoordinator` (secure + plain) |
| Camera multi-submit | Same raw QR string submitted twice within a second | `QrScannerViewModel` + scanner |
| Concurrent map focus | Interleaved `SelectedPoi` / translation from QR query + user tap | `PoiFocusService` |
| UI + geofence double audio | Map `PlayPoiAsync` then geofence `SpeakAsync` for same POI | `GeofenceService` vs `PoiNarrationService` |
| Double translation analytics | `Requested` + `DedupHit` for joiners on same in-flight key | `TranslationOrchestrator` |
| Implicit bootstrap ordering | Deep link consumed before localization ready (edge timing) | `AppShell` vs `ILocalizationService` |

---

## Resolution strategy per subsystem

### POI entry (QR / manual / deep link)

- **Strategy:** Serialize the entire coordinator method; suppress duplicate **same code** within 2.5s **before** any `AppState` or navigation side effects.
- **Idempotency:** Second call in window → `Success=true`, `Navigated=false` (no Shell hop, no redundant state writes).

### Scanner VM

- **Strategy:** Short **raw-string** debounce (1.2s) independent of coordinator’s normalized-code window; cleared on `ResetForPageAppearing`.
- **Rationale:** Catches burst identical frames before coordinator work or parse cost.

### Translation orchestration

- **Strategy:** Keep in-flight task sharing; emit **`Requested` only for the leader**; joiners emit **`DedupHit` only**.
- **Idempotency:** Same `(code, lang)` always awaits the same underlying `Task` until completion.

### Map focus

- **Strategy:** `SemaphoreSlim` around focus core so only one focus pipeline mutates selection + optional `RequestTranslationAsync` at a time.

### Geofence

- **Strategy:** If geofence winner **code** equals `AppState.SelectedPoi.Code`, skip proximity narration (UI already “owns” that POI context).

### Bootstrap / deep link

- **Strategy:** `AppBootstrapPipeline.OnShellReadyAsync` runs localization init, then `OnShellAppeared`, making order explicit and stable for audits.

---

## Execution order rules

1. **Auth:** `RestoreSessionAsync` before swapping `MainPage` to Shell or login stack.
2. **Shell visible:** Localization init **before** pending deep-link consumption.
3. **POI entry:** At most one coordinator execution deep in the stack; navigation still funnels through `INavigationService` (serialized Shell).
4. **Focus:** Map/QR-driven focus operations do not overlap writes to `SelectedPoi`.
5. **Geofence:** Location evaluation may skip audio when selection already matches candidate POI code.

---

## Concurrency safeguards (summary)

```
PoiEntryCoordinator     → SemaphoreSlim (1) full method
NavigationService       → Semaphore + flag (existing)
TranslationOrchestrator → lock + in-flight task map (existing) + adjusted Track
PoiTranslationService   → per-key SemaphoreSlim (existing)
PoiFocusService         → SemaphoreSlim (1) focus core
GeofenceService         → TryWait(0) gate + movement/cooldown (existing) + selection match skip
DeepLinkCoordinator     → dispatch SemaphoreSlim (existing)
```

---

## Idempotency guarantees

| Operation | Guarantee |
|-----------|-----------|
| Same QR code within suppression window | No second navigation; no duplicate state mutation from coordinator |
| Same raw scan burst | Scanner VM drops duplicate submissions |
| Same translation request key | Single provider execution; joiners await same task |
| Same POI focus storm | Serialized; last completion wins selection |
| Geofence for selected POI | No extra TTS from geofence path |

---

## Verification checklist (manual)

1. Scan same QR twice quickly → one navigation; second may no-op cleanly.
2. Open deep link while tapping map rapidly → no Shell crash; single dispatch path.
3. Select POI on map (narration plays) → remain inside radius → geofence should **not** replay same short narration solely from proximity.
4. Trigger two `RequestTranslationAsync` for same code/lang from narration + focus → one `Requested` event, second caller `DedupHit` only.

---

## Non-changes (explicit)

- No edits under `ContractDefinition/`, `ContractObservability/`, `Contracts.Generated/`, `ContractSourceGenerator/`, replay docs, or telemetry wiring.
- No ViewModel rewrite; only targeted guards in `QrScannerViewModel`.
- No database schema or API contract changes.
