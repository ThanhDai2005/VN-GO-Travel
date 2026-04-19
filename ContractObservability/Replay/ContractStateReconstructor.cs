namespace ContractObservability.Replay;

/// <summary>Time-travel style read-only reconstruction from ordered journal entries (6.7.6).</summary>
public static class ContractStateReconstructor
{
    public static bool TryReconstructAt(
        IReadOnlyList<ContractJournalEntry> orderedAscending,
        DateTimeOffset asOfUtc,
        int actionChainDepth,
        out ReconstructedContractState state)
    {
        state = new ReconstructedContractState { AsOfUtc = asOfUtc };
        var slice = orderedAscending
            .Where(e => UnifiedEventTimelineBuilder.NormalizedTimestamp(e) <= asOfUtc)
            .OrderBy(UnifiedEventTimelineBuilder.NormalizedTimestamp)
            .ThenBy(e => e.Sequence)
            .ToList();

        if (slice.Count == 0)
            return false;

        var last = slice[^1];
        var chain = slice
            .Select(e => e.Telemetry.ActionTypeWire ?? "?")
            .Where(s => !string.IsNullOrEmpty(s))
            .TakeLast(actionChainDepth)
            .ToList();

        state = new ReconstructedContractState
        {
            AsOfUtc = asOfUtc,
            LastPoiCode = last.Telemetry.PoiCode,
            LastActionTypeWire = last.Telemetry.ActionTypeWire,
            LastGeoSourceWire = last.Telemetry.GeoSourceWire,
            LastSourceLabel = last.Telemetry.Source,
            RecentActionChain = chain,
            LastSequence = last.Sequence
        };
        return true;
    }

    /// <summary>Builds a lightweight POI navigation narrative (advisory text, no side effects).</summary>
    public static IReadOnlyList<string> DescribePoiNavigationChain(IReadOnlyList<ContractJournalEntry> sessionOrdered)
    {
        var lines = new List<string>();
        foreach (var e in sessionOrdered
                     .OrderBy(UnifiedEventTimelineBuilder.NormalizedTimestamp)
                     .ThenBy(x => x.Sequence))
        {
            var a = e.Telemetry.ActionTypeWire ?? "?";
            var p = e.Telemetry.PoiCode ?? "";
            var ts = UnifiedEventTimelineBuilder.NormalizedTimestamp(e);
            lines.Add($"{ts:O} | act={a} | poi={p} | geo={e.Telemetry.GeoSourceWire} | src={e.Telemetry.Source}");
        }

        return lines;
    }
}
