namespace ContractObservability.Replay;

public sealed class ContractForensicReport
{
    public int AnomalyScore { get; init; }
    public IReadOnlyList<string> Findings { get; init; } = Array.Empty<string>();
    public IReadOnlyList<string> AdvisoryHints { get; init; } = Array.Empty<string>();
}
