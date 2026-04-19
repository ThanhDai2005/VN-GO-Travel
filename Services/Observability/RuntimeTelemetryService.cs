using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using Microsoft.Extensions.Logging;
using Microsoft.Maui.Storage;

namespace MauiApp1.Services.Observability;

/// <summary>
/// Batched, non-blocking runtime telemetry (ROEL). Never blocks producers; drops on back-pressure.
/// </summary>
public sealed class RuntimeTelemetryService : IRuntimeTelemetry, IDisposable
{
    private readonly ILogger<RuntimeTelemetryService>? _logger;
    private readonly Channel<RuntimeTelemetryEvent> _channel;
    private readonly CancellationTokenSource _cts = new();
    private readonly Task _processor;
    private readonly ConcurrentQueue<RuntimeTelemetryEvent> _ring = new();
    private const int RingMax = 1024;

    private long _dropped;

    public RuntimeTelemetryService(ILogger<RuntimeTelemetryService>? logger = null)
    {
        _logger = logger;
        _channel = Channel.CreateBounded<RuntimeTelemetryEvent>(new BoundedChannelOptions(3000)
        {
            SingleReader = true,
            SingleWriter = false,
            FullMode = BoundedChannelFullMode.DropWrite
        });

        _processor = Task.Run(ProcessLoopAsync);
    }

    public void TryEnqueue(in RuntimeTelemetryEvent evt)
    {
        if (!_channel.Writer.TryWrite(evt))
            Interlocked.Increment(ref _dropped);
    }

    public IReadOnlyList<RuntimeTelemetryEvent> GetRecentSnapshot(int maxCount = 512)
    {
        var arr = _ring.ToArray();
        if (arr.Length <= maxCount)
            return arr;
        return arr[^maxCount..];
    }

    private async Task ProcessLoopAsync()
    {
        var token = _cts.Token;
        var batch = new List<RuntimeTelemetryEvent>(64);
        try
        {
            while (await _channel.Reader.WaitToReadAsync(token).ConfigureAwait(false))
            {
                batch.Clear();
                while (batch.Count < 64 && _channel.Reader.TryRead(out var item))
                    batch.Add(item);

                if (batch.Count == 0)
                    continue;

                foreach (var e in batch)
                {
                    while (_ring.Count >= RingMax && _ring.TryDequeue(out _)) { }
                    _ring.Enqueue(e);
                }

                if (Interlocked.Exchange(ref _dropped, 0) is > 0 and var dropped)
                {
                    _logger?.LogWarning("[ROEL] Telemetry dropped writes: {Dropped}", dropped);
                }

#if DEBUG
                if (_logger?.IsEnabled(LogLevel.Trace) == true)
                {
                    foreach (var e in batch)
                        _logger.LogTrace("[ROEL] {Kind} prod={Prod} code={Code} route={Route}", e.Kind, e.ProducerId, e.PoiCode, e.RouteOrAction);
                }

                TryAppendDebugNdjson(batch);
#endif
            }
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "[ROEL] Telemetry processor faulted");
        }
    }

#if DEBUG
    private static readonly object FileGate = new();
    private static void TryAppendDebugNdjson(List<RuntimeTelemetryEvent> batch)
    {
        try
        {
            var dir = Path.Combine(FileSystem.AppDataDirectory, "roel");
            Directory.CreateDirectory(dir);
            var path = Path.Combine(dir, "telemetry.ndjson");
            var sb = new StringBuilder();
            foreach (var e in batch)
            {
                sb.AppendLine(JsonSerializer.Serialize(new
                {
                    e.Kind,
                    t = e.UtcTicks,
                    e.ProducerId,
                    e.Latitude,
                    e.Longitude,
                    e.PoiCode,
                    e.RouteOrAction,
                    e.Detail
                }));
            }

            lock (FileGate)
                File.AppendAllText(path, sb.ToString());
        }
        catch
        {
            // never throw from telemetry
        }
    }
#else
    private static void TryAppendDebugNdjson(List<RuntimeTelemetryEvent> _) { }
#endif

    public void Dispose()
    {
        try
        {
            _cts.Cancel();
            _channel.Writer.TryComplete();
            _processor.GetAwaiter().GetResult();
        }
        catch
        {
            // ignore
        }
        finally
        {
            _cts.Dispose();
        }
    }
}
