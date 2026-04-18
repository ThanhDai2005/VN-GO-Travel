namespace ContractObservability;

/// <summary>Per-field analytics for EventContractV1 wire shape (6.7.5).</summary>
public sealed class ContractFieldUsageReport
{
    public DateTimeOffset GeneratedAtUtc { get; init; }
    public long TotalEventsObserved { get; init; }
    public long RejectedEventsObserved { get; init; }
    public IReadOnlyList<ContractFieldUsageRow> Fields { get; init; } = Array.Empty<ContractFieldUsageRow>();
    public IReadOnlyDictionary<string, long> ActionTypeHistogram { get; init; } = new Dictionary<string, long>(StringComparer.Ordinal);
    public IReadOnlyDictionary<string, long> GeoSourceHistogram { get; init; } = new Dictionary<string, long>(StringComparer.Ordinal);
    public IReadOnlyDictionary<string, long> ContractVersionHistogram { get; init; } = new Dictionary<string, long>(StringComparer.Ordinal);
    public DurationPercentileSummary DurationMs { get; init; } = new();
}

public sealed class ContractFieldUsageRow
{
    public string JsonFieldName { get; init; } = "";
    /// <summary>Share of events where the field is considered populated (non-empty string, enum wire set, numeric non-null, bool true/false as applicable).</summary>
    public double UsageRatePercent { get; init; }
    /// <summary>Share of events where the field is null, empty, or absent for optional string-like fields.</summary>
    public double NullOrEmptyRatePercent { get; init; }
    /// <summary>0–100 heuristic: higher means more downstream reliance signals (simple composite).</summary>
    public int DownstreamImpactScore { get; init; }
}

public sealed class DurationPercentileSummary
{
    public long Samples { get; init; }
    public double P50Ms { get; init; }
    public double P95Ms { get; init; }
    public double P99Ms { get; init; }
}
