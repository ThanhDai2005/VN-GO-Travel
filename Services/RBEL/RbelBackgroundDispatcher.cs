using System.Threading;
using MauiApp1.Configuration;
using MauiApp1.Models;
using MauiApp1.Services.Observability;
using Microsoft.Extensions.Logging;

namespace MauiApp1.Services.RBEL;

/// <summary>
/// 7.3.1 — Polls ROEL snapshots (read-only), maps to RBEL wire events, batches, POSTs off the UI thread.
/// Does not modify GAK/MSAL/NAV/ROEL decorator implementations.
/// </summary>
public sealed class RbelBackgroundDispatcher : IDisposable
{
    private readonly IRuntimeTelemetry _telemetry;
    private readonly IRbelEventQueue _queue;
    private readonly RbelHttpClient _http;
    private readonly IUserContextSnapshotProvider _userContext;
    private readonly TranslationTrackingSession _session;
    private readonly RbelCorrelationScope _correlation;
    private readonly RbelRuntimeSequenceSource _sequence;
    private readonly ILogger<RbelBackgroundDispatcher>? _logger;

    private CancellationTokenSource? _cts;
    private Task? _loop;
    private long _roelUtcWatermark;
    private int _bootPhase;

    public RbelBackgroundDispatcher(
        IRuntimeTelemetry telemetry,
        IRbelEventQueue queue,
        RbelHttpClient http,
        IUserContextSnapshotProvider userContext,
        TranslationTrackingSession session,
        RbelCorrelationScope correlation,
        RbelRuntimeSequenceSource sequence,
        ILogger<RbelBackgroundDispatcher>? logger = null)
    {
        _telemetry = telemetry;
        _queue = queue;
        _http = http;
        _userContext = userContext;
        _session = session;
        _correlation = correlation;
        _sequence = sequence;
        _logger = logger;
    }

    public void Start()
    {
        if (_cts != null)
            return;

        _cts = new CancellationTokenSource();
        var token = _cts.Token;
        _loop = Task.Run(() => RunLoopAsync(token), token);
    }

    public void Stop()
    {
        try
        {
            _cts?.Cancel();
        }
        catch { }

        _cts?.Dispose();
        _cts = null;
        _loop = null;
    }

    private async Task RunLoopAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1.5));
        var batchBuilder = new RbelBatchBuilder();
        var drainBuffer = new List<RbelWireEvent>(256);
        try
        {
            while (!ct.IsCancellationRequested && await timer.WaitForNextTickAsync(ct).ConfigureAwait(false))
            {
                if (!RbelBridgeConfiguration.IsEnabled)
                    continue;

                try
                {
                    await TapRoelIntoQueueAsync(ct).ConfigureAwait(false);

                    while (true)
                    {
                        drainBuffer.Clear();
                        var n = _queue.TryDrain(drainBuffer, 512);
                        if (n == 0)
                            break;

                        for (var i = 0; i < n; i++)
                            batchBuilder.Add(drainBuffer[i]);

                        while (batchBuilder.ShouldFlush)
                        {
                            var batch = batchBuilder.Flush();
                            if (batch.Count > 0)
                                await _http.PostBatchAsync(batch, ct).ConfigureAwait(false);
                        }
                    }

                    if (batchBuilder.ShouldFlush)
                    {
                        var batch = batchBuilder.Flush();
                        if (batch.Count > 0)
                            await _http.PostBatchAsync(batch, ct).ConfigureAwait(false);
                    }
                }
                catch (Exception ex)
                {
                    _logger?.LogDebug(ex, "[RBEL] tick");
                }
            }
        }
        catch (OperationCanceledException)
        {
        }
    }

    private async Task TapRoelIntoQueueAsync(CancellationToken ct)
    {
        UserContext ctx;
        try
        {
            ctx = await _userContext.GetAsync(ct).ConfigureAwait(false);
        }
        catch
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(ctx.DeviceId))
            return;

        IReadOnlyList<RuntimeTelemetryEvent> snap;
        try
        {
            snap = _telemetry.GetRecentSnapshot(512);
        }
        catch
        {
            return;
        }

        if (snap.Count == 0)
            return;

        var ordered = snap.OrderBy(e => e.UtcTicks).ToList();

        if (Volatile.Read(ref _bootPhase) == 0)
        {
            if (ordered.Count > 0)
                Interlocked.Exchange(ref _roelUtcWatermark, ordered[^1].UtcTicks);
            Interlocked.Exchange(ref _bootPhase, 1);
            return;
        }

        var newMax = Volatile.Read(ref _roelUtcWatermark);
        var cut = Volatile.Read(ref _roelUtcWatermark);
        foreach (var e in ordered)
        {
            if (e.UtcTicks <= cut)
                continue;

            var mapped = RbelMappingProfile.TryMapFromRoel(
                e,
                ctx,
                _correlation,
                _sequence.Next(),
                _session.SessionId);

            if (mapped == null)
                continue;

            _queue.TryEnqueue(mapped);
            if (e.UtcTicks > newMax)
                newMax = e.UtcTicks;
        }

        Interlocked.Exchange(ref _roelUtcWatermark, newMax);
    }

    public void Dispose() => Stop();
}
