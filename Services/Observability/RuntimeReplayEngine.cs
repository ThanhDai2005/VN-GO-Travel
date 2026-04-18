using System.Linq;
using System.Text;

namespace MauiApp1.Services.Observability;

#if DEBUG
/// <summary>
/// DEBUG-only: materializes a human-readable timeline from the in-memory ROEL ring buffer.
/// </summary>
public sealed class RuntimeReplayEngine
{
    private readonly IRuntimeTelemetry _telemetry;

    public RuntimeReplayEngine(IRuntimeTelemetry telemetry) => _telemetry = telemetry;

    public IReadOnlyList<RuntimeTelemetryEvent> ExportRecent(int maxCount = 512)
        => _telemetry.GetRecentSnapshot(maxCount);

    public string BuildTextTimeline(int maxLines = 400)
    {
        var events = _telemetry.GetRecentSnapshot(maxLines).OrderBy(e => e.UtcTicks).ToList();
        var sb = new StringBuilder(events.Count * 48);
        foreach (var e in events)
        {
            var ts = new DateTime(e.UtcTicks, DateTimeKind.Utc);
            sb.Append(ts.ToString("O"))
                .Append(' ')
                .Append(e.Kind)
                .Append(" prod=").Append(e.ProducerId ?? "-")
                .Append(" code=").Append(e.PoiCode ?? "-")
                .Append(" route=").Append(e.RouteOrAction ?? "-");
            if (!string.IsNullOrEmpty(e.Detail))
                sb.Append(" | ").Append(e.Detail);
            sb.AppendLine();
        }

        return sb.ToString();
    }
}
#endif
