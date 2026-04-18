namespace ContractObservability.Replay;

/// <summary>Read-only inferred contract state at a point in time (6.7.6).</summary>
public sealed class ReconstructedContractState
{
    public DateTimeOffset AsOfUtc { get; init; }
    public string? LastPoiCode { get; init; }
    public string? LastActionTypeWire { get; init; }
    public string? LastGeoSourceWire { get; init; }
    public string? LastSourceLabel { get; init; }
    public IReadOnlyList<string> RecentActionChain { get; init; } = Array.Empty<string>();
    public ulong LastSequence { get; init; }
}
