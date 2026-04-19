using System.Diagnostics;
using MauiApp1.ApplicationContracts.Repositories;
using MauiApp1.ApplicationContracts.Services;
using MauiApp1.Models;
using Microsoft.Extensions.Logging;

namespace MauiApp1.Services;

/// <summary>
/// Central entry point for on-demand POI translation requests. Forwards to
/// <see cref="IPoiTranslationService.GetOrTranslateAsync"/> without changing behavior.
/// Concurrent requests for the same (code, language) share one in-flight task.
/// </summary>
public sealed class TranslationOrchestrator
{
    private readonly IPoiTranslationService _poiTranslationService;
    private readonly ILogger<TranslationOrchestrator> _logger;
    private readonly IEventTracker _eventTracker;
    private readonly IUserContextSnapshotProvider _userContext;
    private readonly TranslationTrackingSession _trackingSession;
    private readonly IPoiQueryRepository _poiQuery;

    private readonly Dictionary<(string code, string lang), Task<Poi?>> _inflight = new();
    private readonly object _lock = new();

    public TranslationOrchestrator(
        IPoiTranslationService poiTranslationService,
        ILogger<TranslationOrchestrator> logger,
        IEventTracker eventTracker,
        IUserContextSnapshotProvider userContext,
        TranslationTrackingSession trackingSession,
        IPoiQueryRepository poiQuery)
    {
        _poiTranslationService = poiTranslationService;
        _logger = logger;
        _eventTracker = eventTracker;
        _userContext = userContext;
        _trackingSession = trackingSession;
        _poiQuery = poiQuery;
    }

    /// <summary>
    /// Forwards a translation request to <see cref="IPoiTranslationService.GetOrTranslateAsync"/>.
    /// </summary>
    public async Task<Poi?> RequestTranslationAsync(
        string code,
        string lang,
        TranslationSource source,
        CancellationToken cancellationToken = default)
    {
        var key = MakeKey(code, lang);
        var ctx = await _userContext.GetAsync(cancellationToken).ConfigureAwait(false);
        var requestId = Guid.NewGuid().ToString("N");

        Task<Poi?> task;
        lock (_lock)
        {
            if (_inflight.TryGetValue(key, out var existing))
            {
                _logger.LogInformation(
                    "[TranslationMetric] DedupHit | Req={RequestId} | Code={Code} | Lang={Lang}",
                    requestId,
                    code,
                    lang);
                TrackEvent(ctx, code, lang, TranslationEventStatus.DedupHit, 0, requestId, false);
                task = existing;
            }
            else
            {
                _logger.LogInformation(
                    "[TranslationMetric] Requested | Req={RequestId} | Code={Code} | Lang={Lang} | Source={Source}",
                    requestId,
                    code,
                    lang,
                    source);
                TrackEvent(ctx, code, lang, TranslationEventStatus.Requested, 0, requestId, false);
                task = InternalTranslateAsync(key, code, lang, source, ctx, requestId, cancellationToken);
                _inflight[key] = task;
            }
        }

        return await task.ConfigureAwait(false);
    }

    private void TrackEvent(
        UserContext ctx,
        string code,
        string lang,
        TranslationEventStatus status,
        long durationMs,
        string requestId,
        bool fetchTriggered)
    {
        var geo = TryGetGeoSnapshot(code);
        _eventTracker.Track(new TranslationEvent
        {
            RequestId = requestId,
            SessionId = _trackingSession.SessionId,
            PoiCode = code ?? "",
            Language = lang ?? "",
            UserType = ctx.UserType,
            UserId = ctx.UserId,
            DeviceId = ctx.DeviceId,
            Status = status,
            DurationMs = durationMs,
            Timestamp = DateTimeOffset.UtcNow,
            Source = "translation",
            ActionType = EventActionKind.Manual,
            NetworkType = NetworkTypeResolver.Resolve(),
            FetchTriggered = fetchTriggered,
            UserApproved = null,
            Latitude = geo?.Latitude,
            Longitude = geo?.Longitude,
            GeoRadiusMeters = geo is { Radius: > 0 } ? geo.Radius : null,
            GeoSource = geo != null ? EventGeoSource.Db : EventGeoSource.Unknown,
            BatchItemCount = null
        });
    }

    private Poi? TryGetGeoSnapshot(string code)
    {
        if (string.IsNullOrWhiteSpace(code))
            return null;
        try
        {
            _poiQuery.InitAsync(CancellationToken.None).GetAwaiter().GetResult();
            return _poiQuery.GetByCodeAsync(code.Trim(), null, CancellationToken.None).GetAwaiter().GetResult();
        }
        catch
        {
            return null;
        }
    }

    private static (string code, string lang) MakeKey(string code, string lang)
    {
        var c = string.IsNullOrWhiteSpace(code) ? "" : code.Trim().ToUpperInvariant();
        var l = string.IsNullOrWhiteSpace(lang) ? "" : lang.Trim().ToLowerInvariant();
        return (c, l);
    }

    private async Task<Poi?> InternalTranslateAsync(
        (string NormCode, string NormLang) dedupeKey,
        string code,
        string lang,
        TranslationSource source,
        UserContext userContext,
        string requestId,
        CancellationToken cancellationToken)
    {
        try
        {
            var sw = Stopwatch.StartNew();
            Poi? result = null;
            var completedAwait = false;

            try
            {
                _logger.LogInformation(
                    "[TranslationOrchestrator] Req={RequestId} | Source={Source} | Code={Code} | Lang={Lang}",
                    requestId,
                    source,
                    code,
                    lang);

                result = await _poiTranslationService
                    .GetOrTranslateAsync(code, lang, cancellationToken)
                    .ConfigureAwait(false);
                completedAwait = true;
            }
            catch (Exception)
            {
                sw.Stop();
                TrackEvent(userContext, code, lang, TranslationEventStatus.Exception, sw.ElapsedMilliseconds, requestId, true);
                throw;
            }
            finally
            {
                if (sw.IsRunning)
                    sw.Stop();
                _logger.LogInformation(
                    "[TranslationMetric] Completed | Req={RequestId} | Code={Code} | Lang={Lang} | DurationMs={Duration}",
                    requestId,
                    code,
                    lang,
                    sw.ElapsedMilliseconds);
            }

            if (completedAwait && result == null)
            {
                _logger.LogInformation(
                    "[TranslationMetric] Failed | Req={RequestId} | Code={Code} | Lang={Lang}",
                    requestId,
                    code,
                    lang);

                TrackEvent(userContext, code, lang, TranslationEventStatus.Failed, sw.ElapsedMilliseconds, requestId, true);

                _logger.LogWarning(
                    "[TranslationOrchestrator] Req={RequestId} | NULL result | Code={Code} | Lang={Lang} | Source={Source}",
                    requestId,
                    code,
                    lang,
                    source);
            }
            else if (completedAwait && result != null)
            {
                TrackEvent(userContext, code, lang, TranslationEventStatus.Success, sw.ElapsedMilliseconds, requestId, true);
            }

            return result;
        }
        finally
        {
            lock (_lock)
            {
                _inflight.Remove(dedupeKey);
            }
        }
    }
}
