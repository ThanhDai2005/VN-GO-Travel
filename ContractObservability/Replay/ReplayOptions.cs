namespace ContractObservability.Replay;

public sealed class ReplayOptions
{
    /// <summary>1 = real-time-ish gaps, 5 = five times faster, 0 = no artificial delays.</summary>
    public double SpeedMultiplier { get; init; } = 1;

    /// <summary>When true, inter-frame delays are skipped (fast-forward).</summary>
    public bool SkipDelays { get; init; }

    public TimeSpan MaxDelayPerStep { get; init; } = TimeSpan.FromSeconds(2);

    public string? FilterActionTypeWire { get; init; }
    public string? FilterPoiCode { get; init; }
    public string? FilterGeoSourceWire { get; init; }
}

public readonly record struct ReplayFrame(int StepIndex, ContractJournalEntry Entry);
