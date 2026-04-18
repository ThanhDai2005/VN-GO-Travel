using System.Linq;
using MauiApp1.Services.Observability;

namespace MauiApp1.Services.Chaos;

/// <summary>PCSL — reads ROEL ring buffer and reports invariant / ordering observations (no auto-fix).</summary>
public sealed class ChaosValidationEngine
{
    public IReadOnlyList<string> ValidateRecent(IRuntimeTelemetry telemetry, int maxEvents = 512)
    {
#if DEBUG
        var snap = telemetry.GetRecentSnapshot(maxEvents).OrderBy(e => e.UtcTicks).ToList();
        var issues = new List<string>();

        for (var i = 1; i < snap.Count; i++)
        {
            if (snap[i].UtcTicks + 1 < snap[i - 1].UtcTicks)
                issues.Add("Telemetry snapshot ordering: non-monotonic UtcTicks (possible async reorder).");
        }

        var publishes = snap.Count(e => e.Kind == RuntimeTelemetryEventKind.LocationPublishCompleted);
        var geos = snap.Count(e => e.Kind == RuntimeTelemetryEventKind.GeofenceEvaluated);
        if (geos > publishes + 8 && publishes > 0)
            issues.Add("Geofence evaluations markedly exceed publish completions in window (investigate GAK coalescing vs load).");

        return issues;
#else
        return Array.Empty<string>();
#endif
    }
}
