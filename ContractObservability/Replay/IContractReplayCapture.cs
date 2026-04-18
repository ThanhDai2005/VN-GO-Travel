namespace ContractObservability.Replay;

/// <summary>
/// Passive capture hook (6.7.6). Implementations must be non-blocking on the caller thread.
/// </summary>
public interface IContractReplayCapture
{
    /// <summary>When false, producers must skip JSON serialization and avoid calling <see cref="TryCapture"/>.</summary>
    bool IsEnabled { get; }

    /// <summary>Enqueue a wire JSON snapshot + correlated telemetry (fire-and-forget).</summary>
    void TryCapture(string captureSource, string wireJson, ContractTelemetryWireSample telemetry);
}
