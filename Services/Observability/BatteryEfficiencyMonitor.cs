using System.Diagnostics;
using Microsoft.Extensions.Logging;

namespace MauiApp1.Services.Observability;

/// <summary>
/// ROEL passive efficiency signals: duplicate-ish GPS and tick storms (observation only; inner kernels still run).
/// </summary>
public sealed class BatteryEfficiencyMonitor
{
    private readonly ILogger<BatteryEfficiencyMonitor>? _logger;
    private readonly object _gate = new();

    private long _lastGpsUtcTicks;
    private double? _lastLat;
    private double? _lastLon;

    private int _ticksInWindow;
    private long _windowStartUtcTicks;

    private const int StormWindowMs = 2000;
    private const int StormThresholdTicks = 12;

    public BatteryEfficiencyMonitor(ILogger<BatteryEfficiencyMonitor>? logger = null)
    {
        _logger = logger;
    }

    public void OnGpsTickObserved(string producerId, double lat, double lon, IRuntimeTelemetry telemetry)
    {
        var nowTicks = DateTime.UtcNow.Ticks;

        lock (_gate)
        {
            if (_lastLat.HasValue && _lastLon.HasValue)
            {
                var d = HaversineMeters(_lastLat.Value, _lastLon.Value, lat, lon);
                if (d < 3.0 && (nowTicks - _lastGpsUtcTicks) < TimeSpan.FromMilliseconds(400).Ticks)
                {
                    telemetry.TryEnqueue(new RuntimeTelemetryEvent(
                        RuntimeTelemetryEventKind.PotentialDuplicateGpsObserved,
                        nowTicks,
                        producerId,
                        lat,
                        lon,
                        detail: $"distM={d:0.0}"));
                }
            }

            _lastLat = lat;
            _lastLon = lon;
            _lastGpsUtcTicks = nowTicks;

            if (_windowStartUtcTicks == 0)
                _windowStartUtcTicks = nowTicks;

            _ticksInWindow++;
            var wMs = new TimeSpan(nowTicks - _windowStartUtcTicks).TotalMilliseconds;
            if (wMs > StormWindowMs)
            {
                if (_ticksInWindow >= StormThresholdTicks)
                {
                    var msg =
                        $"[ROEL] GPS tick storm: {_ticksInWindow} publishes in ~{StormWindowMs}ms (review map + background overlap).";
                    Debug.WriteLine(msg);
                    _logger?.LogWarning(msg);
                    telemetry.TryEnqueue(new RuntimeTelemetryEvent(
                        RuntimeTelemetryEventKind.PerformanceAnomaly,
                        nowTicks,
                        producerId,
                        detail: msg));
                }

                _ticksInWindow = 0;
                _windowStartUtcTicks = nowTicks;
            }
        }
    }

    private static double HaversineMeters(double lat1, double lon1, double lat2, double lon2)
    {
        const double R = 6371000;
        static double Rad(double d) => d * (Math.PI / 180.0);
        var dLat = Rad(lat2 - lat1);
        var dLon = Rad(lon2 - lon1);
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                Math.Cos(Rad(lat1)) * Math.Cos(Rad(lat2)) * Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
        var c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
        return R * c;
    }
}
