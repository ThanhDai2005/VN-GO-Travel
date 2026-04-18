using System.Text.Json;
using ContractObservability;
using ContractObservability.Replay;
using MauiApp1.Models;
using Microsoft.Extensions.Logging;

namespace MauiApp1.Services;

/// <summary>
/// Buffers translation events; flushes batches; persists buffer to disk to survive process kill.
/// </summary>
public sealed class QueuedEventTracker : IEventTracker, IDisposable
{
    private const int MaxBatch = 10;
    private const int FlushThreshold = 5;
    private const int MaxBufferEvents = 200;
    private static readonly TimeSpan FlushInterval = TimeSpan.FromSeconds(2);
    private const string BufferFileName = "event-buffer.json";

    private static readonly JsonSerializerOptions PersistJsonOpts = TranslationEventJsonOptions.Create();

    private readonly IEventBatchSink _sink;
    private readonly ILogger<QueuedEventTracker> _logger;
    private readonly IContractTelemetryTracker? _contractTelemetry;
    private readonly IContractReplayCapture _replayCapture;
    private readonly string _bufferPath;
    private readonly object _sync = new();
    private readonly List<TranslationEvent> _buffer = new();
    private readonly SemaphoreSlim _flushGate = new(1, 1);
    private readonly Timer _timer;
    private bool _disposed;

    public QueuedEventTracker(
        IEventBatchSink sink,
        ILogger<QueuedEventTracker> logger,
        IContractTelemetryTracker? contractTelemetry = null,
        IContractReplayCapture? replayCapture = null)
    {
        _sink = sink;
        _logger = logger;
        _contractTelemetry = contractTelemetry;
        _replayCapture = replayCapture ?? new NoOpContractReplayCapture();
        _bufferPath = Path.Combine(FileSystem.AppDataDirectory, BufferFileName);
        TryLoadPersistedBuffer();
        _timer = new Timer(
            _ => _ = Task.Run(() => FlushSingleBatchForTimerAsync(CancellationToken.None)),
            null,
            FlushInterval,
            FlushInterval);
    }

    public void Track(TranslationEvent evt)
    {
        if (_disposed)
            return;

        var normalized = WithStatusSnake(evt);
        _logger.LogInformation(
            "[TranslationEvent] E={EventId} R={RequestId} S={SessionId} Src={Source} Act={ActionType} Net={NetworkType} Fetch={FetchTriggered}",
            normalized.EventId,
            normalized.RequestId,
            normalized.SessionId,
            normalized.Source,
            normalized.ActionType,
            normalized.NetworkType,
            normalized.FetchTriggered);

        int count;
        lock (_sync)
        {
            _buffer.Add(normalized);
            while (_buffer.Count > MaxBufferEvents)
                _buffer.RemoveAt(0);
            count = _buffer.Count;
            PersistBufferWhileLocked();
        }

        if (count >= FlushThreshold)
            _ = Task.Run(() => FlushSingleBatchForTimerAsync(CancellationToken.None));

        var wireSample = ContractTelemetryMauiFactory.FromTranslationEvent(normalized);
        _contractTelemetry?.TryRecord(wireSample);
        if (_replayCapture.IsEnabled)
            _replayCapture.TryCapture("maui", JsonSerializer.Serialize(normalized, PersistJsonOpts), wireSample.Clone());
    }

    private static string MetaString(string? value) =>
        string.IsNullOrWhiteSpace(value) ? "unknown" : value.Trim();

    private static TranslationEvent WithStatusSnake(TranslationEvent evt)
    {
        var snake = string.IsNullOrEmpty(evt.StatusSnake)
            ? TranslationEventStatusNormalizer.ToSnake(evt.Status)
            : evt.StatusSnake;

        var eventId = string.IsNullOrEmpty(evt.EventId)
            ? Guid.NewGuid().ToString("N")
            : evt.EventId;

        var contractVersion = string.IsNullOrWhiteSpace(evt.ContractVersion)
            ? EventContractV1.Version
            : evt.ContractVersion.Trim();

        return new TranslationEvent
        {
            ContractVersion = contractVersion,
            EventId = eventId,
            RequestId = evt.RequestId,
            SessionId = evt.SessionId,
            PoiCode = evt.PoiCode,
            Language = evt.Language,
            UserType = evt.UserType,
            UserId = evt.UserId,
            DeviceId = evt.DeviceId,
            Status = evt.Status,
            StatusSnake = snake,
            DurationMs = AnalyticsEventPipelineNormalizer.NormalizeDurationMs(evt.DurationMs),
            Timestamp = evt.Timestamp,
            Source = MetaString(evt.Source),
            ActionType = AnalyticsEventPipelineNormalizer.NormalizeActionKind(evt.ActionType),
            NetworkType = MetaString(evt.NetworkType),
            UserApproved = evt.UserApproved,
            FetchTriggered = evt.FetchTriggered,
            Latitude = evt.Latitude,
            Longitude = evt.Longitude,
            GeoRadiusMeters = evt.GeoRadiusMeters,
            GeoSource = AnalyticsEventPipelineNormalizer.NormalizeGeoSource(evt.GeoSource),
            BatchItemCount = evt.BatchItemCount
        };
    }

    private void TryLoadPersistedBuffer()
    {
        try
        {
            if (!File.Exists(_bufferPath))
                return;

            var json = File.ReadAllText(_bufferPath);
            if (string.IsNullOrWhiteSpace(json))
                return;

            var loaded = JsonSerializer.Deserialize<List<TranslationEvent>>(json, PersistJsonOpts);
            if (loaded == null || loaded.Count == 0)
                return;

            lock (_sync)
            {
                foreach (var e in loaded)
                    _buffer.Add(WithStatusSnake(e));

                while (_buffer.Count > MaxBufferEvents)
                    _buffer.RemoveAt(0);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[TranslationEventBuffer] Ignored corrupted or unreadable {File}", BufferFileName);
            try
            {
                if (File.Exists(_bufferPath))
                    File.Delete(_bufferPath);
            }
            catch { }
        }
    }

    /// <summary>Caller must hold <c>_sync</c>.</summary>
    private void PersistBufferWhileLocked()
    {
        try
        {
            var json = JsonSerializer.Serialize(_buffer, PersistJsonOpts);
            File.WriteAllText(_bufferPath, json);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[TranslationEventBuffer] Persist failed");
        }
    }

    private async Task FlushSingleBatchForTimerAsync(CancellationToken cancellationToken)
    {
        if (_disposed)
            return;

        await _flushGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            await FlushOneBatchCoreAsync(cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            _flushGate.Release();
        }
    }

    /// <returns><see langword="false"/> if the batch could not be sent (events re-queued).</returns>
    private async Task<bool> FlushOneBatchCoreAsync(CancellationToken cancellationToken)
    {
        List<TranslationEvent> batch;
        lock (_sync)
        {
            if (_buffer.Count == 0)
                return true;

            var take = Math.Min(MaxBatch, _buffer.Count);
            batch = _buffer.GetRange(0, take);
            _buffer.RemoveRange(0, take);
            PersistBufferWhileLocked();
        }

        try
        {
            await _sink.SendBatchAsync(batch, cancellationToken).ConfigureAwait(false);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[TranslationEventBatch] Sink failed for batch of {Count}", batch.Count);
            lock (_sync)
            {
                _buffer.InsertRange(0, batch);
                PersistBufferWhileLocked();
            }

            return false;
        }
    }

    /// <summary>Drains buffer in batches until empty. Safe to call multiple times.</summary>
    public async Task FlushAsync(CancellationToken cancellationToken = default)
    {
        if (_disposed)
            return;

        await _flushGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            while (true)
            {
                int remaining;
                lock (_sync)
                {
                    remaining = _buffer.Count;
                }

                if (remaining == 0)
                    return;

                var ok = await FlushOneBatchCoreAsync(cancellationToken).ConfigureAwait(false);
                if (!ok)
                    return;
            }
        }
        finally
        {
            _flushGate.Release();
        }
    }

    public void Dispose()
    {
        if (_disposed)
            return;
        _disposed = true;
        _timer.Dispose();
        try
        {
            FlushAsync(CancellationToken.None).GetAwaiter().GetResult();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[TranslationEventBatch] Final flush failed");
        }

        _flushGate.Dispose();
    }
}
