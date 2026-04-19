namespace ContractObservability.Replay;

/// <summary>Deterministic, side-effect-free replay over journal entries (6.7.6).</summary>
public static class EventReplayEngine
{
    public static async IAsyncEnumerable<ReplayFrame> ReplayAsync(
        IReadOnlyList<ContractJournalEntry> ordered,
        ReplayOptions options,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var seq = ordered
            .Where(e => PassesFilter(e, options))
            .OrderBy(UnifiedEventTimelineBuilder.NormalizedTimestamp)
            .ThenBy(e => e.Sequence)
            .ToList();

        ContractJournalEntry? previous = null;
        var step = 0;
        foreach (var e in seq)
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (!options.SkipDelays && options.SpeedMultiplier > 0 && previous is not null)
            {
                var delta = UnifiedEventTimelineBuilder.NormalizedTimestamp(e)
                    - UnifiedEventTimelineBuilder.NormalizedTimestamp(previous);
                if (delta > TimeSpan.Zero)
                {
                    var scaled = TimeSpan.FromTicks((long)(delta.Ticks / options.SpeedMultiplier));
                    if (scaled > options.MaxDelayPerStep)
                        scaled = options.MaxDelayPerStep;
                    await Task.Delay(scaled, cancellationToken).ConfigureAwait(false);
                }
            }

            previous = e;
            yield return new ReplayFrame(step++, e);
        }
    }

    private static bool PassesFilter(ContractJournalEntry e, ReplayOptions o)
    {
        if (o.FilterActionTypeWire is { } a &&
            !string.Equals(e.Telemetry.ActionTypeWire, a, StringComparison.OrdinalIgnoreCase) &&
            e.Telemetry.ActionTypeWire?.Contains(a, StringComparison.OrdinalIgnoreCase) != true)
            return false;

        if (o.FilterPoiCode is { } p &&
            !string.Equals(e.Telemetry.PoiCode, p, StringComparison.OrdinalIgnoreCase))
            return false;

        if (o.FilterGeoSourceWire is { } g &&
            !string.Equals(e.Telemetry.GeoSourceWire, g, StringComparison.OrdinalIgnoreCase))
            return false;

        return true;
    }
}
