namespace MauiApp1.Services.Governance;

/// <summary>
/// Inputs to <see cref="ProductionReadinessEvaluator"/> — supplied by CI, manual review, or diagnostics.
/// This type does not read runtime state by itself (no hidden coupling to GAK/MSAL).
/// </summary>
public sealed class ProductionReadinessInput
{
    /// <summary>RDGL / thread-affinity or documented invariant breaches detected in the evaluation window.</summary>
    public int RdglInvariantViolationCount { get; init; }

    /// <summary>Whether static CI grep rules for GAK/MSAL boundaries passed.</summary>
    public bool CiCrossLayerWriteChecksGreen { get; init; } = true;

    /// <summary>ROEL channel drops (best-effort counter from test harness).</summary>
    public int RoelTelemetryDroppedCount { get; init; }

    /// <summary>ROEL <see cref="Observability.RuntimeTelemetryEventKind.PerformanceAnomaly"/> count in window.</summary>
    public int RoelPerformanceAnomalyCount { get; init; }

    /// <summary>Issues returned by PCSL chaos validation (DEBUG chaos runs).</summary>
    public int PcslChaosValidationIssueCount { get; init; }

    /// <summary>Whether the last chaos run completed without unhandled faults (harness flag).</summary>
    public bool PcslChaosRunCompletedClean { get; init; } = true;
}
