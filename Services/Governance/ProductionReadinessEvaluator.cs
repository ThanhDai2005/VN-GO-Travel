namespace MauiApp1.Services.Governance;

/// <summary>
/// PCGL — deterministic go/no-go evaluation from explicit inputs (no runtime side effects).
/// </summary>
public sealed class ProductionReadinessEvaluator
{
    public const int RoelDropDegradedThreshold = 50;
    public const int RoelAnomalyDegradedThreshold = 200;
    public ProductionState Evaluate(ProductionReadinessInput input)
    {
        if (input.RdglInvariantViolationCount > 0 || !input.CiCrossLayerWriteChecksGreen)
            return ProductionState.Blocked;

        if (!input.PcslChaosRunCompletedClean
            || input.PcslChaosValidationIssueCount > 0
            || input.RoelTelemetryDroppedCount > RoelDropDegradedThreshold
            || input.RoelPerformanceAnomalyCount > RoelAnomalyDegradedThreshold)
            return ProductionState.Degraded;

        return ProductionState.Ready;
    }
}
