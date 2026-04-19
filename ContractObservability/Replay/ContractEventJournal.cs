using System.Threading.Channels;

namespace ContractObservability.Replay;

/// <summary>
/// Append-only in-memory journal with async ingestion (6.7.6). Oldest entries may be dropped when over capacity.
/// </summary>
public sealed class ContractEventJournal : IContractReplayCapture, IDisposable
{
    public bool IsEnabled => true;

    private const int ChannelCapacity = 2048;
    private const int MaxRetainedEntries = 25_000;

    private readonly Channel<CaptureWork> _channel;
    private readonly List<ContractJournalEntry> _entries = new();
    private readonly object _listLock = new();
    private ulong _sequence;
    private int _started;
    private CancellationTokenSource? _cts;
    private Task? _consumer;

    public ContractEventJournal()
    {
        _channel = Channel.CreateBounded<CaptureWork>(new BoundedChannelOptions(ChannelCapacity)
        {
            FullMode = BoundedChannelFullMode.DropWrite,
            SingleReader = true,
            SingleWriter = false
        });
    }

    public void EnsureStarted()
    {
        if (Interlocked.CompareExchange(ref _started, 1, 0) != 0)
            return;
        _cts = new CancellationTokenSource();
        _consumer = Task.Run(() => ConsumeAsync(_cts.Token));
    }

    public void TryCapture(string captureSource, string wireJson, ContractTelemetryWireSample telemetry)
    {
        EnsureStarted();
        var work = new CaptureWork(captureSource, wireJson, telemetry.Clone());
        _channel.Writer.TryWrite(work);
    }

    private async Task ConsumeAsync(CancellationToken ct)
    {
        try
        {
            while (await _channel.Reader.WaitToReadAsync(ct).ConfigureAwait(false))
            {
                while (_channel.Reader.TryRead(out var w))
                    AppendCore(w);
            }
        }
        catch (OperationCanceledException) { }
    }

    private void AppendCore(CaptureWork w)
    {
        var seq = Interlocked.Increment(ref _sequence);
        var entry = new ContractJournalEntry
        {
            Sequence = seq,
            CapturedUtc = DateTimeOffset.UtcNow,
            EventTimestampUtc = w.Telemetry.Timestamp == default ? DateTimeOffset.UtcNow : w.Telemetry.Timestamp,
            CaptureSource = w.Source,
            WireJson = w.Json,
            Telemetry = w.Telemetry
        };

        lock (_listLock)
        {
            _entries.Add(entry);
            if (_entries.Count > MaxRetainedEntries)
                _entries.RemoveRange(0, _entries.Count - MaxRetainedEntries);
        }
    }

    public IReadOnlyList<ContractJournalEntry> GetSnapshot()
    {
        lock (_listLock)
            return _entries.ToArray();
    }

    public void Dispose()
    {
        try
        {
            _cts?.Cancel();
            _channel.Writer.TryComplete();
            _consumer?.GetAwaiter().GetResult();
        }
        catch { }

        _cts?.Dispose();
    }

    private readonly record struct CaptureWork(string Source, string Json, ContractTelemetryWireSample Telemetry);
}
