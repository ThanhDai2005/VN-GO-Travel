namespace MauiApp1.Services.MapUi;

/// <summary>
/// Rollout switches for Map State Arbitration Layer (7.2.4). Defaults favor production parity with softer races.
/// </summary>
public static class MapUiArbitrationModes
{
    /// <summary>
    /// Phase 1 (shadow): when true, suppression rules are evaluated and logged, but the UI commit still happens.
    /// </summary>
    public static bool ShadowLogOnlySuppressions { get; set; }

    /// <summary>
    /// Emergency bypass: skip dedupe and priority holds; commits remain serialized and main-thread safe.
    /// </summary>
    public static bool DisableArbitrationRules { get; set; }
}
