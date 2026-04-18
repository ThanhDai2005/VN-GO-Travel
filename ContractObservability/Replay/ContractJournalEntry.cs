namespace ContractObservability.Replay;

/// <summary>Immutable append-only journal record (6.7.6).</summary>
public sealed class ContractJournalEntry
{
    public ulong Sequence { get; init; }
    /// <summary>Wall clock when the record was captured (ingest/receive side).</summary>
    public DateTimeOffset CapturedUtc { get; init; }
    /// <summary>Producer event timestamp from the wire payload (contract field <c>timestamp</c>).</summary>
    public DateTimeOffset EventTimestampUtc { get; init; }
    /// <summary>Logical source, e.g. <c>maui</c> or <c>api</c>.</summary>
    public string CaptureSource { get; init; } = "";
    /// <summary>Full wire JSON snapshot (immutable string).</summary>
    public string WireJson { get; init; } = "";
    /// <summary>Telemetry-aligned snapshot at capture time (defensive copy).</summary>
    public required ContractTelemetryWireSample Telemetry { get; init; }
}
