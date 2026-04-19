namespace MauiApp1.Services.RBEL;

public interface IRbelEventQueue
{
    /// <summary>Non-blocking; returns false if queue saturated (drops + ROEL signal).</summary>
    bool TryEnqueue(RbelWireEvent evt);

    /// <summary>Drain up to <paramref name="max"/> events into <paramref name="buffer"/> (non-blocking).</summary>
    int TryDrain(List<RbelWireEvent> buffer, int max);
}
