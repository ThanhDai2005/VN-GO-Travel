namespace MauiApp1.Services.Governance;

/// <summary>
/// PCGL — canonical governance identifiers for CI/docs (no runtime behavior).
/// </summary>
public static class RuntimeGovernanceRules
{
    public const string GakLocationTruth = "GAK is the only path that may assign AppState.CurrentLocation.";
    public const string MsalUiSelectionTruth = "MSAL is the only path that may commit AppState.SelectedPoi (CommitSelectedPoiForUi).";
    public const string RoelObserveOnly = "ROEL observes and records; it must not block hot paths or change decisions.";
    public const string PcslDebugOnly = "PCSL chaos decorators are registered only in DEBUG builds; never enable chaos in production.";
    public const string RdglInvariantSurface = "RDGL validates thread affinity for CurrentLocation/SelectedPoi in DEBUG; CI grep enforces write boundaries.";
}
