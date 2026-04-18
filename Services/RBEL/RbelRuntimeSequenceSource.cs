using System.Threading;

namespace MauiApp1.Services.RBEL;

/// <summary>Monotonic sequence for RBEL <c>runtimeSequence</c> (idempotency with device + correlation).</summary>
public sealed class RbelRuntimeSequenceSource
{
    private long _value;

    public long Next() => Interlocked.Increment(ref _value);
}
