namespace MauiApp1.Services.RBEL;

/// <summary>Accumulates RBEL wire events until count or wall-clock flush threshold.</summary>
public sealed class RbelBatchBuilder
{
    public const int MaxBatchEvents = 100;
    public static readonly TimeSpan MaxBatchWait = TimeSpan.FromSeconds(2);

    private readonly List<RbelWireEvent> _items = new();
    private DateTimeOffset? _firstUtc;

    public void Add(RbelWireEvent e)
    {
        _items.Add(e);
        _firstUtc ??= DateTimeOffset.UtcNow;
    }

    public bool ShouldFlush =>
        _items.Count >= MaxBatchEvents
        || (_items.Count > 0 && DateTimeOffset.UtcNow - _firstUtc >= MaxBatchWait);

    public IReadOnlyList<RbelWireEvent> Peek() => _items;

    public List<RbelWireEvent> Flush()
    {
        var copy = new List<RbelWireEvent>(_items);
        _items.Clear();
        _firstUtc = null;
        return copy;
    }
}
