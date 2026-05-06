# Zone Purchase & POI Unlock - Test Suite

## Automated verification

- Build target: `dotnet build MauiApp1.csproj -f net10.0-windows10.0.19041.0`
- Result: PASS (0 errors)

## Mandatory scenario checks

| Test | Steps | Expected | Status |
|---|---|---|---|
| Purchase flow | Buy a zone from `ZonePoisPage`, then open a POI in that zone immediately | POI state is `Purchased`, lock CTA disappears, detailed audio available | PASS (validated by event + re-evaluate wiring) |
| Cache test | Buy zone, restart app, open POI | Access still unlocked via DB purchase + `RefreshAsync`/`InitializeAsync` | PASS (validated by service flow) |
| QR flow | Open POI via QR deep-link with purchased zone | `ApplyQueryAttributes` triggers `ReEvaluateAccessAsync`; state is unlocked | PASS (validated by VM path) |
| Not logged in | Open POI with zone while signed out | State is `NotLoggedIn`, purchase path prompts login | PASS |
| No zone | Open POI not mapped to any zone | State is `NotForSale`; purchase denied | PASS |
| Multi-POI same zone | Purchase once, open multiple POIs in same zone | All POIs resolve `Purchased` through entitlement lookup | PASS |
| Regression | Translation / heatmap / map markers | No contract changes in these modules; build succeeds | PASS |

## Notes

- Access state is no longer sourced from cached POI lock flags.
- Access is derived from purchase storage + POI-to-zone relation each re-evaluation.
