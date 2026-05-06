# Zone Purchase & POI Unlock - Full End-to-End System Audit

## 1. SYSTEM OVERVIEW

The Zone Purchase & POI Unlock system manages access to Points of Interest (POIs) spread across predefined Zones. Users must purhase access to a Zone to unlock full features (e.g., long-form narration, full descriptions) of the POIs within that Zone. Summarized/preview features are often provided to incentivize purchase.

## 2. FULL FLOW DIAGRAM

User -> (Clicks POI in Zone) -> PoiDetailViewModel
   |
   +-> Entitlement Check (Backend / Local Cache)
   |       |
   |       +-> [Not Purchased] -> Shows Preview ("Nghe tóm tắt", "Mua để trải nghiệm")
   |       |
   |       +-> [Purchased] -> Unlocks Full Features
   |
   +-> (Clicks Purchase) -> ZonePoisPage.xaml
           |
           +-> Call API POST `/purchase/zone`
           |
           +-> Response 200 OK -> Update Backend DB
                   |
                   +-> [BUG SPOT] Mobile Cache Update? ViewModel Refresh? UI Re-render?

## 3. SCENARIO ANALYSIS

### Scenario 1: User Not Logged In
- **Steps**: User opens app -> Clicks POI.
- **API Call**: No purchase API called. Content API may be called anonymously or fetch from local cache.
- **Backend Response**: Returns preview content (e.g., `NarrationShort` only).
- **UI State**: Shows locked state ("Mua để trải nghiệm", "Nghe tóm tắt"). Purchase button triggers login prompt.
- **Observation**: Working as intended. No fake access.

### Scenario 2: Logged In But Not Purchased
- **Steps**: User logs in -> Clicks POI in unpurchased Zone.
- **API Call**: Fetches POI details, checks entitlement locally/remotely.
- **UI State**: Shows locked state ("Mua để trải nghiệm").
- **Observation**: Correctly blocks access.

### Scenario 3: Logged In + Purchased Zone (THE BUG)
- **Steps**: User logs in -> Buys Zone -> Clicks POI.
- **Expected**: POI unlocks immediately, UI updates, audio switches to full.
- **Actual**: UI still shows "Nghe tóm tắt", "Mua để trải nghiệm".

## 4. DATA FLOW TRACE & ROOT CAUSE ANALYSIS

1. **User buys zone**: User confirms purchase on `ZonePoisPage.xaml`.
2. **Backend updates**: API `purchase/zone` is called and returns success.
3. **Mobile receives**: `response.IsSuccessStatusCode` is true. `AccessFrame.IsVisible = false;` is run, and `await LoadZonePoisAsync();` is called.
4. **Cache/ViewModel Mismatch [CRITICAL BUG]**: 
    - When the user navigates back to the POI (or views the POI detail), the UI does NOT reflect the newly purchased state.
    - The `PoiDetailViewModel` caches or loads the POI content but does not re-verify the access rights properly *after* a purchase, OR the `GetPoiDetailUseCase`/`TranslationResolver` doesn't know about the new access status.
    - The API response for `zones/{zoneCode}` returns `pois` array, but it does not update the global entitlement cache in a way that `PoiDetailViewModel` reacts to immediately. The `PoiDetailViewModel` is likely relying on stale data or a missing event to refresh its `IsLocked`/UI rendering state.

## 5. UI STATE MATRIX

| State | Logged In | Purchased | POI Locked? | UI Button | Audio | Status |
|------|----------|----------|-------------|-----------|-------|--------|
| Not Logged In | No | No | Yes | Login | Short | ✅ Correct |
| Logged In, Not Purchased | Yes | No | Yes | Buy | Short | ✅ Correct |
| Purchased but Stale UI | Yes | Yes | **Yes (Visually)** | Buy | Short | ❌ **Broken** |
| Purchased & Correct | Yes | Yes | No | None | Long | N/A (Failing here) |

## 6. ROOT CAUSE ANALYSIS

The root cause of the "Mua để trải nghiệm" staying on screen after a valid purchase is a **State Synchronization & Cache Invalidation Issue**.

1. **Purchasing in `ZonePoisPage`**: When `LoadZonePoisAsync` is called after purchase, it updates the local SQLite cache via `_poiCommand.UpsertAsync` but it DOES NOT explicitly publish a weak event/message (like `WeakReferenceMessenger.Default.Send(new ZonePurchasedMessage(zoneCode))`) to notify active ViewModels (like the Map or `PoiDetailViewModel`) that access has changed.
2. **Missing Re-fetch in `PoiDetailViewModel`**: When navigating back from the purchase page to the detailed POI view, the ViewModel might not be re-evaluating its `IsLocked`/Access Status state, serving the stale initialized state.

## 7. BUG LIST (PRIORITIZED)

1. [CRITICAL] `PoiDetailViewModel` does not receive or handle a "Zone Purchased" event to refresh its UI state.
2. [HIGH] The local POI access caching mechanism is not properly invalidated upon successful purchase.
3. [MEDIUM] `ZonePoisPage` manually updates UI elements but lacks a centralized state management push for global access changes.

## 8. RISK LEVEL

**CRITICAL** - A core monetization loop is broken. Users who pay money do not receive the product visually, leading to immediate frustration and potential chargebacks.

## 9. EXACT FIX RECOMMENDATIONS

1. **Implement Event Messaging**: Use `CommunityToolkit.Mvvm.Messaging` to broadcast a `ZoneUnlockedMessage`.
2. **Listen to Event**: In `PoiDetailViewModel`, register to handle `ZoneUnlockedMessage`. When received for the matching Zone, trigger a `LoadPoiAsync` or `EvaluateAccessStatus` method to re-render the UI (hiding the "Mua để trải nghiệm" button and enabling full audio).
3. **Invalidate Cache**: Ensure that the `ZoneAccessService` updates memory/local DB so that the next `GetPoiDetailUseCase` pull returns full content automatically.

## 10. FINAL VERDICT

**UNSTABLE / CRITICAL ISSUE** - The purchase flow succeeds on the backend but completely fails to synchronize state to the frontend UI, breaking user trust immediately after payment.
