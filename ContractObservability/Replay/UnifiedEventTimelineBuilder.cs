namespace ContractObservability.Replay;

/// <summary>Merges MAUI + API + telemetry-shaped journal rows into one ordered view (6.7.6).</summary>
public static class UnifiedEventTimelineBuilder
{
    /// <summary>Prefer producer <c>timestamp</c>; fall back to ingest time when missing.</summary>
    public static DateTimeOffset NormalizedTimestamp(ContractJournalEntry e) =>
        e.EventTimestampUtc != default ? e.EventTimestampUtc : e.CapturedUtc;

    public static IReadOnlyList<ContractJournalEntry> MergeChronological(
        IEnumerable<IReadOnlyList<ContractJournalEntry>> sources)
    {
        var list = sources.SelectMany(x => x).ToList();
        return list
            .OrderBy(NormalizedTimestamp)
            .ThenBy(e => e.CapturedUtc)
            .ThenBy(e => e.Sequence)
            .ThenBy(e => e.CaptureSource, StringComparer.Ordinal)
            .ToList();
    }

    public static IReadOnlyList<ContractJournalEntry> FromJournal(IReadOnlyList<ContractJournalEntry> journal) =>
        MergeChronological(new[] { journal });
}
