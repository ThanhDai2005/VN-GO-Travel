using System.Threading.Channels;
using MauiApp1.Services.Observability;

namespace MauiApp1.Services.RBEL;

/// <summary>Bounded in-memory queue between ROEL tap and HTTP batch (drops on pressure).</summary>
public sealed class RbelEventQueue : IRbelEventQueue
{
    private readonly Channel<RbelWireEvent> _channel;
    private readonly IRuntimeTelemetry _telemetry;

    public RbelEventQueue(IRuntimeTelemetry telemetry)
    {
        _telemetry = telemetry;
        _channel = Channel.CreateBounded<RbelWireEvent>(new BoundedChannelOptions(2000)
        {
            SingleReader = true,
            SingleWriter = false,
            FullMode = BoundedChannelFullMode.DropWrite
        });
    }

    public bool TryEnqueue(RbelWireEvent evt)
    {
        if (_channel.Writer.TryWrite(evt))
            return true;

        _telemetry.TryEnqueue(new RuntimeTelemetryEvent(
            RuntimeTelemetryEventKind.PerformanceAnomaly,
            DateTime.UtcNow.Ticks,
            "rbel",
            detail: "rbel_queue_full"));
        return false;
    }

    public int TryDrain(List<RbelWireEvent> buffer, int max)
    {
        var n = 0;
        while (n < max && _channel.Reader.TryRead(out var e))
        {
            buffer.Add(e);
            n++;
        }

        return n;
    }
}
