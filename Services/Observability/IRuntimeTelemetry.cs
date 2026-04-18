namespace MauiApp1.Services.Observability;

/// <summary>Non-blocking runtime telemetry sink (ROEL).</summary>
public interface IRuntimeTelemetry
{
    /// <summary>Best-effort enqueue; never blocks caller; may drop on pressure.</summary>
    void TryEnqueue(in RuntimeTelemetryEvent evt);

    /// <summary>Recent events for DEBUG replay (ring buffer; newest last).</summary>
    IReadOnlyList<RuntimeTelemetryEvent> GetRecentSnapshot(int maxCount = 512);
}
