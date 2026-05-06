using System.Diagnostics;
using System.Text.Json;
using System.Threading;
using MauiApp1.ApplicationContracts.Repositories;
using MauiApp1.ApplicationContracts.Services;
using MauiApp1.Models;
using MauiApp1.Services.MapUi;
using MauiApp1.Services.Observability;
using Microsoft.Maui.ApplicationModel;
using Microsoft.Maui.Controls;

namespace MauiApp1.Services;

public class PoiEntryCoordinator : IPoiEntryCoordinator
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    private readonly IPoiQueryRepository _poiQuery;
    private readonly IPoiCommandRepository _poiCommand;
    private readonly ILocalizationService _localization;
    private readonly ApiService _api;
    private readonly AuthService _auth;
    private readonly IQrScannerService _qr;
    private readonly INavigationService _navService;
    private readonly AppState _appState;
    private readonly IMapUiStateArbitrator _mapUi;
    private readonly IEventTracker _eventTracker;
    private readonly IRuntimeTelemetry _telemetry;
    private readonly IUserContextSnapshotProvider _userContext;
    private readonly TranslationTrackingSession _trackingSession;
    private readonly AudioPrefetchService _audioPrefetch;
    /// <summary>Serializes all POI entry work across await points (7.2 — replaces non-async-safe bool gate).</summary>
    private readonly SemaphoreSlim _handleMutex = new(1, 1);
    private string? _lastHandledCode;
    private DateTime _lastHandledAt = DateTime.MinValue;

    /// <summary>Duplicate QR / same-code entry suppression window (session-scoped, process memory).</summary>
    private const int DuplicateEntrySuppressionMs = 2500;

    public PoiEntryCoordinator(
        IPoiQueryRepository poiQuery,
        IPoiCommandRepository poiCommand,
        ILocalizationService localization,
        ApiService api,
        AuthService auth,
        IQrScannerService qr,
        INavigationService navService,
        AppState appState,
        IMapUiStateArbitrator mapUi,
        IEventTracker eventTracker,
        IRuntimeTelemetry telemetry,
        IUserContextSnapshotProvider userContext,
        TranslationTrackingSession trackingSession,
        AudioPrefetchService audioPrefetch)
    {
        _poiQuery = poiQuery;
        _poiCommand = poiCommand;
        _localization = localization;
        _api = api;
        _auth = auth;
        _qr = qr;
        _navService = navService;
        _appState = appState;
        _mapUi = mapUi;
        _eventTracker = eventTracker;
        _telemetry = telemetry;
        _userContext = userContext;
        _trackingSession = trackingSession;
        _audioPrefetch = audioPrefetch;
    }

    public async Task<PoiEntryResult> HandleEntryAsync(PoiEntryRequest request, CancellationToken cancellationToken = default)
    {
        if (request == null) return new PoiEntryResult { Success = false, Error = "Request is null" };

        await _handleMutex.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var raw = request.RawInput;
            Debug.WriteLine($"[QR-NAV] PoiEntryCoordinator.HandleEntryAsync start source={request.Source} rawLen={raw?.Length ?? 0}");

            var parsed = await _qr.ParseAsync(raw, cancellationToken).ConfigureAwait(false);
            if (!parsed.Success)
                return new PoiEntryResult { Success = false, Error = parsed.Error ?? "Invalid QR" };

            if (parsed.IsSecureScanToken && !string.IsNullOrEmpty(parsed.ScanToken))
                return await HandleSecureScanAsync(request, parsed.ScanToken, cancellationToken).ConfigureAwait(false);

            var code = parsed.Code!;
            return await NavigateByCodeAsync(request, code, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            return new PoiEntryResult { Success = false, Error = ex.Message };
        }
        finally
        {
            _handleMutex.Release();
        }
    }

    private bool ShouldSuppressDuplicateNavigation(string code)
    {
        if (string.IsNullOrEmpty(_lastHandledCode) || string.IsNullOrEmpty(code))
            return false;
        if (!string.Equals(_lastHandledCode, code, StringComparison.OrdinalIgnoreCase))
            return false;
        var since = (DateTime.UtcNow - _lastHandledAt).TotalMilliseconds;
        return since >= 0 && since < DuplicateEntrySuppressionMs;
    }

    private void MarkHandled(string code)
    {
        _lastHandledCode = code;
        _lastHandledAt = DateTime.UtcNow;
    }

    private async Task<PoiEntryResult> HandleSecureScanAsync(PoiEntryRequest request, string token, CancellationToken cancellationToken)
    {
        using var resp = await _api.PostAsJsonAsync("zones/scan", new { token }, cancellationToken).ConfigureAwait(false);
        var bodyText = await resp.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        if (!resp.IsSuccessStatusCode)
        {
            var msg = TryReadApiErrorMessage(bodyText) ?? $"HTTP {(int)resp.StatusCode}";
            return new PoiEntryResult { Success = false, Error = msg };
        }

        ZoneScanApiResponse? envelope;
        try
        {
            envelope = JsonSerializer.Deserialize<ZoneScanApiResponse>(bodyText, JsonOpts);
        }
        catch (Exception ex)
        {
            return new PoiEntryResult { Success = false, Error = "Invalid server response: " + ex.Message };
        }

        var data = envelope?.Data;
        if (data?.Zone == null || string.IsNullOrWhiteSpace(data.Zone.Code))
            return new PoiEntryResult { Success = false, Error = "Invalid zone payload from server" };

        var zoneCode = data.Zone.Code.Trim().ToUpperInvariant();

        Debug.WriteLine($"[QR-NAV] Zone scan successful: code='{zoneCode}' pois={data.Pois?.Count ?? 0}");
        await MergeZoneScanResultIntoLocalAsync(data, cancellationToken).ConfigureAwait(false);
        _ = Task.Run(() => _audioPrefetch.PrefetchZoneAudioAsync(zoneCode, data.Pois ?? new List<ZonePoiData>()));

        await _poiQuery.InitAsync(cancellationToken).ConfigureAwait(false);

        var preferred = !string.IsNullOrWhiteSpace(request.PreferredLanguage)
            ? request.PreferredLanguage
            : _appState.CurrentLanguage;

        var route = $"/zonepois?zoneCode={Uri.EscapeDataString(zoneCode)}&zoneName={Uri.EscapeDataString(data.Zone.Name ?? "")}&lang={Uri.EscapeDataString(preferred)}";
        Debug.WriteLine($"[QR-NAV] zone scan navigating to zone POI list route={route}");
        await _navService.NavigateToAsync(route);

        MarkHandled(zoneCode);

        await TrackQrScanAnalyticsAsync(
                zoneCode,
                preferred,
                fetchTriggered: true,
                cancellationToken,
                null,
                null,
                null,
                EventGeoSource.Qr)
            .ConfigureAwait(false);

        return new PoiEntryResult { Success = true, Navigated = true };
    }

    private async Task MergeScanResultIntoLocalAsync(PoiScanData data, CancellationToken cancellationToken)
    {
        if (data.Location == null) return;
        var code = data.Code!.Trim().ToUpperInvariant();

        await _poiQuery.InitAsync(cancellationToken).ConfigureAwait(false);

        var poi = new Poi
        {
            Id = code,
            Code = code,
            Latitude = data.Location.Lat,
            Longitude = data.Location.Lng,
            Radius = data.Radius > 0 ? data.Radius : 50,
            Priority = data.Priority != 0 ? data.Priority : 1
        };
        await _poiCommand.UpsertAsync(poi, cancellationToken).ConfigureAwait(false);

        if (!string.IsNullOrWhiteSpace(data.Name))
        {
            var vi = new PoiLocalization
            {
                Code = code,
                LanguageCode = "vi",
                Name = data.Name?.Trim() ?? "",
                Summary = data.Summary?.Trim() ?? "",
                NarrationShort = string.IsNullOrWhiteSpace(data.NarrationShort)
                    ? (data.Summary?.Trim() ?? data.Name?.Trim() ?? "")
                    : data.NarrationShort!.Trim(),
                NarrationLong = string.IsNullOrWhiteSpace(data.NarrationLong)
                    ? (data.NarrationShort?.Trim() ?? data.Summary?.Trim() ?? data.Name?.Trim() ?? "")
                    : data.NarrationLong!.Trim()
            };
            _localization.RegisterDynamicTranslation(code, "vi", vi);
        }

        void Reg(string lang, string? text)
        {
            if (string.IsNullOrWhiteSpace(text)) return;
            _localization.RegisterDynamicTranslation(code, lang, PoiServerContentParser.BuildLocalization(code, lang, text));
        }

        Reg("en", data.Content?.En);
        if (string.IsNullOrWhiteSpace(data.Name))
            Reg("vi", data.Content?.Vi);
    }

    private async Task MergeZoneScanResultIntoLocalAsync(ZoneScanData data, CancellationToken cancellationToken)
    {
        if (data?.Pois == null || data.Pois.Count == 0) return;

        await _poiQuery.InitAsync(cancellationToken).ConfigureAwait(false);

        foreach (var poiData in data.Pois)
        {
            if (poiData.Location == null || string.IsNullOrWhiteSpace(poiData.Code))
            {
                Debug.WriteLine($"[QR-NAV] Skipping POI ingestion: code='{poiData.Code ?? "NULL"}' locationIsNull={poiData.Location == null}");
                continue;
            }

            var code = poiData.Code.Trim().ToUpperInvariant();
            Debug.WriteLine($"[QR-NAV] Ingesting POI: {code} (lat={poiData.Location.Lat}, lng={poiData.Location.Lng})");

            var poi = new Poi
            {
                Id = code,
                Code = code,
                Latitude = poiData.Location.Lat,
                Longitude = poiData.Location.Lng,
                Radius = poiData.Radius > 0 ? poiData.Radius : 50,
                Priority = poiData.Priority != 0 ? poiData.Priority : 1,
                ZoneCode = data.Zone?.Code?.Trim().ToUpperInvariant(),
                ZoneName = data.Zone?.Name
            };
            await _poiCommand.UpsertAsync(poi, cancellationToken).ConfigureAwait(false);

            if (!string.IsNullOrWhiteSpace(poiData.Name))
            {
                var vi = new PoiLocalization
                {
                    Code = code,
                    LanguageCode = "vi",
                    Name = poiData.Name?.Trim() ?? "",
                    Summary = poiData.Summary?.Trim() ?? "",
                    NarrationShort = string.IsNullOrWhiteSpace(poiData.NarrationShort)
                        ? (poiData.Summary?.Trim() ?? poiData.Name?.Trim() ?? "")
                        : poiData.NarrationShort!.Trim(),
                    NarrationLong = string.IsNullOrWhiteSpace(poiData.NarrationLong)
                        ? (poiData.NarrationShort?.Trim() ?? poiData.Summary?.Trim() ?? poiData.Name?.Trim() ?? "")
                        : poiData.NarrationLong!.Trim()
                };
                _localization.RegisterDynamicTranslation(code, "vi", vi);
            }

            void Reg(string lang, string? text)
            {
                if (string.IsNullOrWhiteSpace(text)) return;
                _localization.RegisterDynamicTranslation(code, lang, PoiServerContentParser.BuildLocalization(code, lang, text));
            }

            Reg("en", poiData.Content?.En);
            if (string.IsNullOrWhiteSpace(poiData.Name))
                Reg("vi", poiData.Content?.Vi);
        }

        Debug.WriteLine($"[QR-NAV] Merged {data.Pois.Count} POIs from zone scan into local database");
    }

    private async Task<PoiEntryResult> NavigateByCodeAsync(PoiEntryRequest request, string code, CancellationToken cancellationToken)
    {
        if (ShouldSuppressDuplicateNavigation(code))
        {
            Debug.WriteLine($"[QR-NAV] Duplicate handle suppressed for code='{code}' (pre-mutation)");
            return new PoiEntryResult { Success = true, Navigated = false };
        }

        try
        {
            await _mapUi.ApplySelectedPoiByCodeAsync(MapUiSelectionSource.CoordinatorQrOrDeepLink, code, cancellationToken).ConfigureAwait(false);
            Debug.WriteLine($"[QR-NAV] PoiEntryCoordinator set current POI code={code}");
        }
        catch { }

        await _poiQuery.InitAsync(cancellationToken).ConfigureAwait(false);

        Debug.WriteLine($"[QR-NAV] PoiEntryCoordinator parsed code={code}");

        var preferred = !string.IsNullOrWhiteSpace(request.PreferredLanguage)
            ? request.PreferredLanguage
            : _appState.CurrentLanguage;

        var core = await _poiQuery.GetByCodeAsync(code, null, cancellationToken).ConfigureAwait(false);
        if (core == null)
            return new PoiEntryResult { Success = false, Error = "POI not found in database" };

        Debug.WriteLine($"[QR-NAV] POI found: code={code} preferred_lang={preferred}");

        var route = BuildRoute(request, code, preferred);

        Debug.WriteLine(
            $"[QR-NAV] PoiEntryCoordinator navigating mode={request.NavigationMode} route={route}");
        if (request.Source == PoiEntrySource.FutureDeepLink
            && request.NavigationMode == PoiNavigationMode.Detail)
        {
            Debug.WriteLine("[DL-NAV] Navigation to PoiDetail started");
        }

        await _navService.NavigateToAsync(route);

        if (request.Source == PoiEntrySource.FutureDeepLink
            && request.NavigationMode == PoiNavigationMode.Detail)
        {
            Debug.WriteLine("[DL-NAV] Navigation completed");
        }

        MarkHandled(code);

        Debug.WriteLine($"[QR-NAV] PoiEntryCoordinator completed for code={code}");

        await TrackQrScanAnalyticsAsync(
                code,
                preferred,
                fetchTriggered: false,
                cancellationToken,
                core.Latitude,
                core.Longitude,
                core.Radius > 0 ? core.Radius : null,
                EventGeoSource.Qr)
            .ConfigureAwait(false);

        return new PoiEntryResult { Success = true, Navigated = true };
    }

    /// <summary>Best-effort analytics; must not affect QR navigation.</summary>
    private async Task TrackQrScanAnalyticsAsync(
        string poiCode,
        string? language,
        bool fetchTriggered,
        CancellationToken cancellationToken,
        double? poiLatitude,
        double? poiLongitude,
        double? poiRadiusMeters,
        EventGeoSource geoSource)
    {
        try
        {
            _telemetry.TryEnqueue(new RuntimeTelemetryEvent(
                RuntimeTelemetryEventKind.UiStateCommitted,
                DateTime.UtcNow.Ticks,
                producerId: "qr",
                latitude: poiLatitude,
                longitude: poiLongitude,
                poiCode: poiCode,
                routeOrAction: "qr_scan",
                detail: $"action=qr_scan;poi={poiCode ?? ""}"));

            var ctx = await _userContext.GetAsync(cancellationToken).ConfigureAwait(false);
            var reqId = Guid.NewGuid().ToString("N");
            _eventTracker.Track(new TranslationEvent
            {
                RequestId = reqId,
                SessionId = _trackingSession.SessionId,
                PoiCode = poiCode ?? "",
                Language = language ?? "",
                UserType = ctx.UserType,
                UserId = ctx.UserId,
                DeviceId = ctx.DeviceId,
                Status = TranslationEventStatus.AppEvent,
                DurationMs = 0,
                Timestamp = DateTimeOffset.UtcNow,
                Source = "qr_scan",
                ActionType = EventActionKind.Scan,
                NetworkType = NetworkTypeResolver.Resolve(),
                FetchTriggered = fetchTriggered,
                UserApproved = null,
                Latitude = poiLatitude,
                Longitude = poiLongitude,
                GeoRadiusMeters = poiRadiusMeters,
                GeoSource = geoSource,
                PoiId = poiCode, // On client, ID is currently Code for seeded POIs
                BatchItemCount = null
            });
        }
        catch
        {
            // intentional: never fail QR flow for analytics
        }
    }

    private static string BuildRoute(PoiEntryRequest request, string code, string preferred)
    {
        if (request.NavigationMode == PoiNavigationMode.Map)
        {
            var qs = $"code={Uri.EscapeDataString(code)}&lang={Uri.EscapeDataString(preferred)}";
            if (request.Source == PoiEntrySource.Scanner)
                qs += "&narrate=1";
            return $"//map?{qs}";
        }

        return $"/poidetail?code={Uri.EscapeDataString(code)}&lang={Uri.EscapeDataString(preferred)}";
    }

    private static string? TryReadApiErrorMessage(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("error", out var err) &&
                err.TryGetProperty("message", out var m))
                return m.GetString();
        }
        catch
        {
            // ignore
        }

        return null;
    }
}
