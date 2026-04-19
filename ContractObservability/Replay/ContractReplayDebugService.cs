#if DEBUG
using System.Text.Json;

namespace ContractObservability.Replay;

/// <summary>Debug/dev orchestration over <see cref="ContractEventJournal"/> (6.7.6). Not compiled into Release.</summary>
public sealed class ContractReplayDebugService
{
    private readonly ContractEventJournal _journal;

    public ContractReplayDebugService(ContractEventJournal journal) => _journal = journal;

    public IAsyncEnumerable<ReplayFrame> ReplaySession(string sessionId, ReplayOptions? options = null, CancellationToken cancellationToken = default)
    {
        var snap = _journal.GetSnapshot();
        var stream = EventSessionStream.FromJournal(snap, sessionId);
        return EventReplayEngine.ReplayAsync(stream.Entries, options ?? new ReplayOptions(), cancellationToken);
    }

    public IAsyncEnumerable<ReplayFrame> ReplayPoi(string poiCode, ReplayOptions? options = null, CancellationToken cancellationToken = default)
    {
        var snap = _journal.GetSnapshot();
        var stream = EventSessionStream.FromPoi(snap, poiCode);
        return EventReplayEngine.ReplayAsync(stream.Entries, options ?? new ReplayOptions(), cancellationToken);
    }

    public IAsyncEnumerable<ReplayFrame> ReplayTimeRange(
        DateTimeOffset from,
        DateTimeOffset to,
        ReplayOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        var filtered = _journal.GetSnapshot()
            .Where(e =>
            {
                var t = UnifiedEventTimelineBuilder.NormalizedTimestamp(e);
                return t >= from && t <= to;
            })
            .ToList();
        return EventReplayEngine.ReplayAsync(filtered, options ?? new ReplayOptions { SkipDelays = true }, cancellationToken);
    }

    /// <summary>JSON Lines export of the current journal snapshot (read-only).</summary>
    public string ExportReplayTrace()
    {
        var opts = new JsonSerializerOptions { WriteIndented = false };
        var lines = _journal.GetSnapshot()
            .OrderBy(UnifiedEventTimelineBuilder.NormalizedTimestamp)
            .ThenBy(e => e.Sequence)
            .Select(e => JsonSerializer.Serialize(new
            {
                e.Sequence,
                e.CapturedUtc,
                e.EventTimestampUtc,
                e.CaptureSource,
                wire = e.WireJson,
                telemetry = e.Telemetry
            }, opts));
        return string.Join("\n", lines);
    }

    public ContractForensicReport ForensicsForSession(string sessionId)
    {
        var snap = _journal.GetSnapshot();
        var stream = EventSessionStream.FromJournal(snap, sessionId);
        return ContractForensicAnalyzer.AnalyzeSession(stream.Entries);
    }
}
#endif
