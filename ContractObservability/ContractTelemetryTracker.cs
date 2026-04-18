using System.Threading.Channels;
using GeneratedContract;
using Microsoft.Extensions.Logging;

namespace ContractObservability;

/// <summary>
/// Fire-and-forget contract telemetry: bounded channel + single consumer updates in-memory aggregates.
/// </summary>
public sealed class ContractTelemetryTracker : IContractTelemetryTracker, IDisposable
{
    public static readonly string[] JsonFieldOrder =
    [
        "contractVersion", "eventId", "requestId", "sessionId", "poiCode", "language", "userType",
        "userId", "deviceId", "status", "durationMs", "timestamp", "source", "actionType",
        "networkType", "userApproved", "fetchTriggered", "latitude", "longitude", "geoRadiusMeters",
        "geoSource", "batchItemCount"
    ];

    private const int ChannelCapacity = 4096;
    private const int DurationWindow = 2048;

    private readonly Channel<ContractTelemetryWireSample> _channel;
    private readonly object _sync = new();
    private readonly long[] _populated = new long[JsonFieldOrder.Length];
    private readonly long[] _emptyish = new long[JsonFieldOrder.Length];
    private readonly List<long> _durations = new();
    private readonly Dictionary<string, long> _actionHist = new(StringComparer.Ordinal);
    private readonly Dictionary<string, long> _geoHist = new(StringComparer.Ordinal);
    private readonly Dictionary<string, long> _versionHist = new(StringComparer.Ordinal);
    private long _total;
    private long _rejected;
    private ContractFieldUsageReport? _priorReportForRisk;
    private readonly ILogger<ContractTelemetryTracker>? _logger;
    private CancellationTokenSource? _cts;
    private Task? _processor;
    private int _started;

    public ContractTelemetryTracker(ILogger<ContractTelemetryTracker>? logger = null)
    {
        _logger = logger;
        _channel = Channel.CreateBounded<ContractTelemetryWireSample>(new BoundedChannelOptions(ChannelCapacity)
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
        _processor = Task.Run(() => RunAsync(_cts.Token));
    }

    public void TryRecord(ContractTelemetryWireSample sample)
    {
        EnsureStarted();
        _channel.Writer.TryWrite(sample);
    }

    private async Task RunAsync(CancellationToken ct)
    {
        try
        {
            while (await _channel.Reader.WaitToReadAsync(ct).ConfigureAwait(false))
            {
                while (_channel.Reader.TryRead(out var s))
                    ApplySample(s);
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            _logger?.LogWarning(ex, "ContractTelemetry consumer stopped unexpectedly");
        }
    }

    private void ApplySample(ContractTelemetryWireSample s)
    {
        lock (_sync)
        {
            _total++;
            if (s.IngestionRejected)
                _rejected++;

            BumpString(0, s.ContractVersion);
            BumpString(1, s.EventId);
            BumpString(2, s.RequestId);
            BumpString(3, s.SessionId);
            BumpString(4, s.PoiCode);
            BumpString(5, s.Language);
            BumpString(6, s.UserTypeWire);
            BumpString(7, s.UserId);
            BumpString(8, s.DeviceId);
            BumpString(9, s.Status);
            BumpDuration(10, s.DurationMs);
            BumpTimestamp(11, s.Timestamp);
            BumpString(12, s.Source);
            BumpString(13, s.ActionTypeWire);
            BumpString(14, s.NetworkType);
            BumpBoolNullable(15, s.UserApproved);
            BumpBool(16, true);
            BumpDoubleNullable(17, s.Latitude);
            BumpDoubleNullable(18, s.Longitude);
            BumpDoubleNullable(19, s.GeoRadiusMeters);
            BumpString(20, s.GeoSourceWire);
            BumpIntNullable(21, s.BatchItemCount);

            if (!string.IsNullOrEmpty(s.ActionTypeWire))
                _actionHist[s.ActionTypeWire] = _actionHist.GetValueOrDefault(s.ActionTypeWire) + 1;
            if (!string.IsNullOrEmpty(s.GeoSourceWire))
                _geoHist[s.GeoSourceWire] = _geoHist.GetValueOrDefault(s.GeoSourceWire) + 1;
            var v = string.IsNullOrWhiteSpace(s.ContractVersion) ? EventContractV1.Version : s.ContractVersion.Trim();
            _versionHist[v] = _versionHist.GetValueOrDefault(v) + 1;

            PushDuration(s.DurationMs);
        }
    }

    private void BumpString(int idx, string? v)
    {
        if (string.IsNullOrWhiteSpace(v))
            _emptyish[idx]++;
        else
            _populated[idx]++;
    }

    private void BumpDuration(int idx, long ms)
    {
        _ = ms;
        _populated[idx]++;
    }

    private void BumpTimestamp(int idx, DateTimeOffset ts)
    {
        if (ts == default)
            _emptyish[idx]++;
        else
            _populated[idx]++;
    }

    private void BumpBoolNullable(int idx, bool? v)
    {
        if (v.HasValue)
            _populated[idx]++;
        else
            _emptyish[idx]++;
    }

    private void BumpBool(int idx, bool _)
    {
        _populated[idx]++;
    }

    private void BumpDoubleNullable(int idx, double? v)
    {
        if (v.HasValue)
            _populated[idx]++;
        else
            _emptyish[idx]++;
    }

    private void BumpIntNullable(int idx, int? v)
    {
        if (v.HasValue)
            _populated[idx]++;
        else
            _emptyish[idx]++;
    }

    private void PushDuration(long ms)
    {
        if (ms < 0)
            ms = 0;
        if (_durations.Count >= DurationWindow)
            _durations.RemoveAt(0);
        _durations.Add(ms);
    }

    public ContractFieldUsageReport BuildUsageReport()
    {
        lock (_sync)
        {
            var rows = new List<ContractFieldUsageRow>();
            var t = Math.Max(1, _total);
            for (var i = 0; i < JsonFieldOrder.Length; i++)
            {
                var pop = _populated[i];
                var emp = _emptyish[i];
                var usage = 100.0 * pop / t;
                var nullRate = 100.0 * emp / t;
                var impact = (int)Math.Clamp(usage * 0.65 + (100 - nullRate) * 0.35, 0, 100);
                rows.Add(new ContractFieldUsageRow
                {
                    JsonFieldName = JsonFieldOrder[i],
                    UsageRatePercent = Math.Round(usage, 2),
                    NullOrEmptyRatePercent = Math.Round(nullRate, 2),
                    DownstreamImpactScore = impact
                });
            }

            return new ContractFieldUsageReport
            {
                GeneratedAtUtc = DateTimeOffset.UtcNow,
                TotalEventsObserved = _total,
                RejectedEventsObserved = _rejected,
                Fields = rows,
                ActionTypeHistogram = new Dictionary<string, long>(_actionHist, StringComparer.Ordinal),
                GeoSourceHistogram = new Dictionary<string, long>(_geoHist, StringComparer.Ordinal),
                ContractVersionHistogram = new Dictionary<string, long>(_versionHist, StringComparer.Ordinal),
                DurationMs = ComputePercentiles(_durations)
            };
        }
    }

    public BreakingChangeRiskResult AnalyzeBreakingChangeRisk()
    {
        var current = BuildUsageReport();
        var result = BreakingChangeRiskAnalyzer.Analyze(_priorReportForRisk, current);
        _priorReportForRisk = CloneReportShallow(current);
        return result;
    }

    public ContractLifecycleDashboardModel BuildDashboardModel(IReadOnlyList<ContractLifecycleNote>? driftNotes = null)
    {
        var usage = BuildUsageReport();
        var risk = BreakingChangeRiskAnalyzer.Analyze(_priorReportForRisk, usage);
        _priorReportForRisk = CloneReportShallow(usage);
        var recs = ContractEvolutionAdvisor.BuildRecommendations(usage, risk);
        var health = usage.Fields.ToDictionary(f => f.JsonFieldName, f => Math.Round(f.UsageRatePercent, 2), StringComparer.Ordinal);

        return new ContractLifecycleDashboardModel
        {
            GeneratedAtUtc = DateTimeOffset.UtcNow,
            CurrentContractVersion = EventContractV1.Version,
            Usage = usage,
            Risk = risk,
            EvolutionSuggestions = recs,
            DriftHistoryNotes = driftNotes ?? Array.Empty<ContractLifecycleNote>(),
            FieldHealthScoreByJsonName = health
        };
    }

    private static ContractFieldUsageReport CloneReportShallow(ContractFieldUsageReport r) =>
        new()
        {
            GeneratedAtUtc = r.GeneratedAtUtc,
            TotalEventsObserved = r.TotalEventsObserved,
            RejectedEventsObserved = r.RejectedEventsObserved,
            Fields = r.Fields.ToList(),
            ActionTypeHistogram = new Dictionary<string, long>(r.ActionTypeHistogram, StringComparer.Ordinal),
            GeoSourceHistogram = new Dictionary<string, long>(r.GeoSourceHistogram, StringComparer.Ordinal),
            ContractVersionHistogram = new Dictionary<string, long>(r.ContractVersionHistogram, StringComparer.Ordinal),
            DurationMs = r.DurationMs
        };

    private static DurationPercentileSummary ComputePercentiles(IReadOnlyList<long> values)
    {
        if (values.Count == 0)
            return new DurationPercentileSummary();

        var sorted = values.OrderBy(x => x).ToArray();
        var n = sorted.Length;
        int Ix(double p) => Math.Clamp((int)Math.Floor((n - 1) * p), 0, n - 1);
        return new DurationPercentileSummary
        {
            Samples = n,
            P50Ms = sorted[Ix(0.50)],
            P95Ms = sorted[Ix(0.95)],
            P99Ms = sorted[Ix(0.99)]
        };
    }

    public void Dispose()
    {
        try
        {
            _cts?.Cancel();
            _channel.Writer.TryComplete();
            _processor?.GetAwaiter().GetResult();
        }
        catch { }

        _cts?.Dispose();
    }
}
