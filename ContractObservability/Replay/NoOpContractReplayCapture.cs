namespace ContractObservability.Replay;

/// <summary>Release-build stand-in: no capture, no serialization (6.7.6).</summary>
public sealed class NoOpContractReplayCapture : IContractReplayCapture
{
    public bool IsEnabled => false;

    public void TryCapture(string captureSource, string wireJson, ContractTelemetryWireSample telemetry) { }
}
