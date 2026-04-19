namespace ContractObservability.Replay;

/// <summary>Session-scoped chronological view over journal entries (6.7.6).</summary>
public sealed class EventSessionStream
{
    public string? SessionId { get; }
    public string? DeviceId { get; }
    public string? UserId { get; }
    public IReadOnlyList<ContractJournalEntry> Entries { get; }

    private EventSessionStream(string? sessionId, string? deviceId, string? userId, IReadOnlyList<ContractJournalEntry> entries)
    {
        SessionId = sessionId;
        DeviceId = deviceId;
        UserId = userId;
        Entries = entries;
    }

    public static EventSessionStream FromJournal(
        IReadOnlyList<ContractJournalEntry> journal,
        string sessionId,
        string? deviceId = null,
        string? userId = null,
        string? poiCode = null)
    {
        var q = journal
            .Where(e => string.Equals(e.Telemetry.SessionId, sessionId, StringComparison.Ordinal))
            .Where(e => deviceId is null || string.Equals(e.Telemetry.DeviceId, deviceId, StringComparison.Ordinal))
            .Where(e => userId is null || string.Equals(e.Telemetry.UserId, userId, StringComparison.Ordinal))
            .Where(e => poiCode is null || string.Equals(e.Telemetry.PoiCode, poiCode, StringComparison.OrdinalIgnoreCase))
            .OrderBy(UnifiedEventTimelineBuilder.NormalizedTimestamp)
            .ThenBy(e => e.Sequence)
            .ToList();

        return new EventSessionStream(sessionId, deviceId, userId, q);
    }

    public static EventSessionStream FromPoi(IReadOnlyList<ContractJournalEntry> journal, string poiCode) =>
        new(
            sessionId: null,
            deviceId: null,
            userId: null,
            journal
                .Where(e => string.Equals(e.Telemetry.PoiCode, poiCode, StringComparison.OrdinalIgnoreCase))
                .OrderBy(UnifiedEventTimelineBuilder.NormalizedTimestamp)
                .ThenBy(e => e.Sequence)
                .ToList());
}
