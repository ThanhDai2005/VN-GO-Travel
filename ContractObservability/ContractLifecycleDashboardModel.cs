using GeneratedContract;

namespace ContractObservability;

/// <summary>Aggregated dashboard payload for tooling / future UI (6.7.5).</summary>
public sealed class ContractLifecycleDashboardModel
{
    public DateTimeOffset GeneratedAtUtc { get; init; }
    public string CurrentContractVersion { get; init; } = EventContractV1.Version;
    public ContractFieldUsageReport Usage { get; init; } = new();
    public BreakingChangeRiskResult Risk { get; init; } = new();
    public IReadOnlyList<ContractEvolutionRecommendation> EvolutionSuggestions { get; init; } = Array.Empty<ContractEvolutionRecommendation>();
    public IReadOnlyList<ContractLifecycleNote> DriftHistoryNotes { get; init; } = Array.Empty<ContractLifecycleNote>();
    public IReadOnlyDictionary<string, double> FieldHealthScoreByJsonName { get; init; } =
        new Dictionary<string, double>(StringComparer.Ordinal);
}

public sealed class ContractLifecycleNote
{
    public string Title { get; init; } = "";
    public string Detail { get; init; } = "";
}
