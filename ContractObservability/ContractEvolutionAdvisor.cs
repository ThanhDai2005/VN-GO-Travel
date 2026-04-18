namespace ContractObservability;

public sealed class ContractEvolutionRecommendation
{
    public string Category { get; init; } = "";
    public string Summary { get; init; } = "";
    public string Rationale { get; init; } = "";
    public string SuggestedHumanAction { get; init; } = "";
}

/// <summary>Advisory-only evolution hints from telemetry (never mutates contracts).</summary>
public static class ContractEvolutionAdvisor
{
    public static IReadOnlyList<ContractEvolutionRecommendation> BuildRecommendations(
        ContractFieldUsageReport report,
        BreakingChangeRiskResult risk)
    {
        var list = new List<ContractEvolutionRecommendation>();
        if (report.TotalEventsObserved < 50)
        {
            list.Add(new ContractEvolutionRecommendation
            {
                Category = "sample_size",
                Summary = "Low event volume for evolution analytics.",
                Rationale = "Fewer than 50 observed events in this window.",
                SuggestedHumanAction = "Defer contract evolution decisions until traffic is representative."
            });
            return list;
        }

        var highValueAdded = 0;
        foreach (var f in report.Fields)
        {
            if (f.UsageRatePercent <= 1 && report.TotalEventsObserved > 200)
            {
                list.Add(new ContractEvolutionRecommendation
                {
                    Category = "candidate_deprecation",
                    Summary = $"Field '{f.JsonFieldName}' appears effectively unused.",
                    Rationale = $"Usage rate {f.UsageRatePercent:F2}% over {report.TotalEventsObserved} events.",
                    SuggestedHumanAction = "If confirmed across environments, consider V2 removal with migration plan (never delete from V1 without version bump)."
                });
            }

            if (f.NullOrEmptyRatePercent > 92 && f.UsageRatePercent < 8)
            {
                list.Add(new ContractEvolutionRecommendation
                {
                    Category = "over_optional",
                    Summary = $"Field '{f.JsonFieldName}' is almost always empty.",
                    Rationale = $"Null/empty rate {f.NullOrEmptyRatePercent:F1}%.",
                    SuggestedHumanAction = "Evaluate whether the field still carries product value or should move to V2 optional profile."
                });
            }

            if (highValueAdded < 3 && f.DownstreamImpactScore >= 85)
            {
                highValueAdded++;
                list.Add(new ContractEvolutionRecommendation
                {
                    Category = "high_value",
                    Summary = $"Field '{f.JsonFieldName}' shows strong population signals.",
                    Rationale = $"Heuristic impact score {f.DownstreamImpactScore}.",
                    SuggestedHumanAction = "Treat as protected in V1; breaking changes require explicit V2 design."
                });
            }
        }

        if (risk.RiskScore0To100 >= 55)
        {
            list.Add(new ContractEvolutionRecommendation
            {
                Category = "v2_readiness_signal",
                Summary = "Telemetry divergence suggests coordinated review.",
                Rationale = $"Breaking-change risk score {risk.RiskScore0To100}.",
                SuggestedHumanAction = "Run CI contract validation, compare clients, and only open V2 after human approval (no auto-upgrade)."
            });
        }

        if (list.Count == 0)
        {
            list.Add(new ContractEvolutionRecommendation
            {
                Category = "stable",
                Summary = "No strong evolution signals in this window.",
                Rationale = "Heuristics found no standout removal or promotion candidates.",
                SuggestedHumanAction = "Keep monitoring; policy still requires human approval for V2."
            });
        }

        return list;
    }
}
