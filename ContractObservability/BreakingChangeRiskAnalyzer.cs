namespace ContractObservability;

public sealed class BreakingChangeRiskResult
{
    public int RiskScore0To100 { get; init; }
    public IReadOnlyList<string> AffectedSignals { get; init; } = Array.Empty<string>();
    public string MitigationHint { get; init; } = "";
}

/// <summary>
/// Compares the latest usage report with a prior snapshot (in-memory). Advisory only.
/// </summary>
public static class BreakingChangeRiskAnalyzer
{
    public static BreakingChangeRiskResult Analyze(ContractFieldUsageReport? previous, ContractFieldUsageReport current)
    {
        if (previous is null || previous.TotalEventsObserved < 10 || current.TotalEventsObserved < 10)
        {
            return new BreakingChangeRiskResult
            {
                RiskScore0To100 = 0,
                AffectedSignals = new[] { "insufficient_history" },
                MitigationHint = "Collect more events before trusting risk scores."
            };
        }

        var signals = new List<string>();
        var score = 0;

        foreach (var cur in current.Fields)
        {
            var prev = previous.Fields.FirstOrDefault(f => f.JsonFieldName == cur.JsonFieldName);
            if (prev is null)
                continue;

            var usageDrop = prev.UsageRatePercent - cur.UsageRatePercent;
            if (usageDrop > 25 && prev.UsageRatePercent > 15)
            {
                score += 18;
                signals.Add($"usage_drop:{cur.JsonFieldName}:{usageDrop:F1}pp");
            }

            var nullSpike = cur.NullOrEmptyRatePercent - prev.NullOrEmptyRatePercent;
            if (nullSpike > 30 && cur.NullOrEmptyRatePercent > 40)
            {
                score += 12;
                signals.Add($"null_spike:{cur.JsonFieldName}:{nullSpike:F1}pp");
            }
        }

        CompareHistogram(current.ActionTypeHistogram, previous.ActionTypeHistogram, "actionType", signals, ref score, 15);
        CompareHistogram(current.GeoSourceHistogram, previous.GeoSourceHistogram, "geoSource", signals, ref score, 12);

        score = Math.Clamp(score, 0, 100);

        var hint = score >= 70
            ? "Treat as investigation: verify client rollouts, API proxies, and contract spec drift before any V2 planning."
            : score >= 40
                ? "Review telemetry and CI contract reports; confirm intentional product change."
                : "Continue monitoring; no strong breaking-change signal.";

        return new BreakingChangeRiskResult
        {
            RiskScore0To100 = score,
            AffectedSignals = signals.Count == 0 ? new[] { "no_material_shift" } : signals,
            MitigationHint = hint
        };
    }

    private static void CompareHistogram(
        IReadOnlyDictionary<string, long> current,
        IReadOnlyDictionary<string, long> previous,
        string label,
        List<string> signals,
        ref int score,
        int weight)
    {
        var cTotal = current.Values.Sum();
        var pTotal = previous.Values.Sum();
        if (cTotal == 0 || pTotal == 0)
            return;

        foreach (var kv in current)
        {
            var cShare = 100.0 * kv.Value / cTotal;
            previous.TryGetValue(kv.Key, out var pCount);
            var pShare = 100.0 * pCount / pTotal;
            if (pShare > 10 && cShare + 20 < pShare)
            {
                score += weight;
                signals.Add($"{label}_shift:{kv.Key}:was_{pShare:F1}pp_now_{cShare:F1}pp");
                return;
            }
        }
    }
}
