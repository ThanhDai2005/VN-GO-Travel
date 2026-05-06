using System.Collections.ObjectModel;
using System.Diagnostics;
using System.Text.Json;
using MauiApp1.ApplicationContracts.Repositories;
using MauiApp1.ApplicationContracts.Services;
using MauiApp1.Models;

namespace MauiApp1.Services;

/// <summary>
/// Owns all POI loading, hydration, and collection management logic.
/// Extracted from MapViewModel to give it a single, testable responsibility.
///
/// Responsibilities:
///   - Seeding SQLite from pois.json on first install
///   - Loading geo rows from SQLite and attaching in-memory localization
///   - Writing the result into AppState.Pois on the main thread
/// </summary>
public class PoiHydrationService
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    private readonly IPoiQueryRepository _poiQuery;
    private readonly IPoiCommandRepository _poiCommand;
    private readonly ILocalizationService _locService;
    private readonly IPreferredLanguageService _languagePrefs;
    private readonly AppState _appState;
    private readonly ApiService? _api;
    private readonly AuthService? _auth;
    private readonly IEventTracker _eventTracker;
    private readonly IUserContextSnapshotProvider _userContext;
    private readonly TranslationTrackingSession _trackingSession;
    private readonly IZoneAccessService _zoneAccess;
    private readonly SemaphoreSlim _loadGate = new(1, 1);

    public PoiHydrationService(
        IPoiQueryRepository poiQuery,
        IPoiCommandRepository poiCommand,
        ILocalizationService locService,
        IPreferredLanguageService languagePrefs,
        AppState appState,
        ApiService api,
        AuthService auth,
        IEventTracker eventTracker,
        IUserContextSnapshotProvider userContext,
        TranslationTrackingSession trackingSession,
        IZoneAccessService zoneAccess)
    {
        _poiQuery = poiQuery;
        _poiCommand = poiCommand;
        _locService = locService;
        _languagePrefs = languagePrefs;
        _appState = appState;
        _api = api;
        _auth = auth;
        _eventTracker = eventTracker;
        _userContext = userContext;
        _trackingSession = trackingSession;
        _zoneAccess = zoneAccess;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public factory — used by multiple services / ViewModels
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Creates a NEW <see cref="Poi"/> instance that copies all geo/meta fields from
    /// <paramref name="core"/> and attaches <paramref name="result"/> as its localization.
    /// <para>
    /// Creating a new object (rather than mutating) is critical: MAUI's binding engine
    /// only re-reads bound properties when <c>PropertyChanged("SelectedPoi")</c> fires,
    /// which only fires when <c>SelectedPoi</c> receives a <em>different</em> reference.
    /// Mutating the existing object's <c>Localization</c> silently stales the UI (BUG-3 fix).
    /// </para>
    /// </summary>
    public static Poi CreateHydratedPoi(Poi core, LocalizationResult result)
    {
        var poi = new Poi
        {
            Id        = core.Id,
            Code      = core.Code,
            Latitude  = core.Latitude,
            Longitude = core.Longitude,
            Radius    = core.Radius,
            Priority  = core.Priority,
            IsFallback        = result.IsFallback,
            UsedLanguage      = result.UsedLang,
            RequestedLanguage = result.RequestedLang
        };
        poi.Localization = result.Localization; // set directly — avoids triggering bridge setters
        return poi;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Collection management
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Replaces <see cref="AppState.Pois"/> with a new collection on the main thread.
    /// </summary>
    public async Task RefreshPoisCollectionAsync(List<Poi> items)
    {
        await MainThread.InvokeOnMainThreadAsync(() =>
        {
            _appState.Pois = new ObservableCollection<Poi>(items);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Initial load
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Loads POIs from SQLite (seeding from <c>pois.json</c> on first run) and
    /// attaches localization for <paramref name="preferredLanguage"/> from the
    /// in-memory <see cref="LocalizationService"/> lookup.
    /// <para>
    /// Called once on app start. Language switching does NOT call this method —
    /// it uses <see cref="LanguageSwitchService.ApplyLanguageSelectionAsync"/> which
    /// re-hydrates in-memory objects without any DB or JSON I/O.
    /// </para>
    /// </summary>
    public async Task LoadPoisAsync(string? preferredLanguage = null)
    {
        await _loadGate.WaitAsync().ConfigureAwait(false);
        try
        {
            var sw = Stopwatch.StartNew();
            Debug.WriteLine("[MAP-LOAD] LoadPoisAsync START");

            await _poiQuery.InitAsync().ConfigureAwait(false);
            await _zoneAccess.InitializeAsync().ConfigureAwait(false);

            var targetLang = string.IsNullOrWhiteSpace(preferredLanguage)
                ? _appState.CurrentLanguage
                : PreferredLanguageService.NormalizeCode(preferredLanguage);

            // Initialize the localization lookup (no-op after first call).
            var tLocStart = sw.ElapsedMilliseconds;
            await _locService.InitializeAsync().ConfigureAwait(false);
            Debug.WriteLine($"[MAP-LOAD]  locService init: {sw.ElapsedMilliseconds - tLocStart} ms");

            // Seed database if empty (first install or fresh clear).
            var tSeedStart = sw.ElapsedMilliseconds;
            var existingCount = await _poiQuery.GetCountAsync().ConfigureAwait(false);
            if (existingCount == 0)
            {
                Debug.WriteLine("[MAP-LOAD] DB empty — seeding core POI data from pois.json");
                var corePois = _locService.GetCorePoisForSeeding();
                await _poiCommand.InsertManyAsync(corePois).ConfigureAwait(false);
                Debug.WriteLine($"[MAP-LOAD] Seeded {corePois.Count} core POIs into SQLite");
            }
            Debug.WriteLine($"[MAP-LOAD]  seed check: {sw.ElapsedMilliseconds - tSeedStart} ms");

            // Load all geo-only rows from SQLite.
            var tDbStart = sw.ElapsedMilliseconds;
            var poisFromDb = await _poiQuery.GetAllAsync().ConfigureAwait(false);
            Debug.WriteLine($"[MAP-LOAD]  DB fetch {poisFromDb.Count} rows: {sw.ElapsedMilliseconds - tDbStart} ms");

            // Hydrate each core Poi with localization for the target language.
            var tHydrateStart = sw.ElapsedMilliseconds;
            var hydrated = poisFromDb
                .Select(p => CreateHydratedPoi(p, _locService.GetLocalizationResult(p.Code, targetLang)))
                .ToList();

            var missing = hydrated.Count(p => p.Localization == null);
            Debug.WriteLine(
                $"[MAP-LOAD]  hydration: {sw.ElapsedMilliseconds - tHydrateStart} ms  " +
                $"hydrated={hydrated.Count}  missing_loc={missing}");

            await RefreshPoisCollectionAsync(hydrated);

            // Language state must be set on main thread as it triggers PropertyChanged notifications.
            await MainThread.InvokeOnMainThreadAsync(() =>
            {
                _appState.CurrentLanguage = targetLang;
            });

            Debug.WriteLine($"[MAP-LOAD] LoadPoisAsync END total={sw.ElapsedMilliseconds} ms");
        }
        finally
        {
            _loadGate.Release();
        }
    }

    /// <summary>
    /// Pull APPROVED POIs from <c>GET /pois/nearby</c> (large radius), upsert SQLite + dynamic translations.
    /// No-op when not signed in or API unavailable.
    /// </summary>
    public async Task SyncPoisFromServerAsync(CancellationToken cancellationToken = default)
    {
        if (_auth?.IsAuthenticated != true || _api == null)
        {
            Debug.WriteLine("[SYNC] Skip: not authenticated or API missing");
            return;
        }

        try
        {
            var sw = Stopwatch.StartNew();
            await _poiQuery.InitAsync(cancellationToken).ConfigureAwait(false);
            await _locService.InitializeAsync(cancellationToken).ConfigureAwait(false);

            // Vietnam-wide bbox approximation via single geospatial query (meters).
            const double lat = 16.0;
            const double lng = 107.5;
            const int radiusM = 1_800_000;
            var url = $"pois/nearby?lat={lat.ToString(System.Globalization.CultureInfo.InvariantCulture)}&lng={lng.ToString(System.Globalization.CultureInfo.InvariantCulture)}&radius={radiusM}&limit=50&page=1";

            using var resp = await _api.GetAsync(url, cancellationToken).ConfigureAwait(false);
            var text = await resp.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            if (!resp.IsSuccessStatusCode)
            {
                Debug.WriteLine($"[SYNC] HTTP {(int)resp.StatusCode}: {text}");
                return;
            }

            using var doc = JsonDocument.Parse(text);
            if (!doc.RootElement.TryGetProperty("data", out var dataEl) || dataEl.ValueKind != JsonValueKind.Array)
            {
                Debug.WriteLine("[SYNC] Missing data array");
                return;
            }

            var n = 0;
            foreach (var el in dataEl.EnumerateArray())
            {
                cancellationToken.ThrowIfCancellationRequested();
                var row = JsonSerializer.Deserialize<NearbySyncItem>(el.GetRawText(), JsonOpts);
                if (row?.Code == null || row.Location == null) continue;
                var code = row.Code.Trim().ToUpperInvariant();

                var poi = new Poi
                {
                    Id = code,
                    Code = code,
                    Latitude = row.Location.Lat,
                    Longitude = row.Location.Lng,
                    Radius = row.Radius > 0 ? row.Radius : 50,
                    Priority = row.Priority > 0 ? row.Priority : 1
                };
                await _poiCommand.UpsertAsync(poi, cancellationToken).ConfigureAwait(false);

                // Prefer structured fields from backend (new model).
                if (!string.IsNullOrWhiteSpace(row.Name) ||
                    !string.IsNullOrWhiteSpace(row.Summary) ||
                    !string.IsNullOrWhiteSpace(row.NarrationShort) ||
                    !string.IsNullOrWhiteSpace(row.NarrationLong))
                {
                    _locService.RegisterDynamicTranslation(code, "vi", new PoiLocalization
                    {
                        Code = code,
                        LanguageCode = "vi",
                        Name = row.Name?.Trim() ?? "",
                        Summary = row.Summary?.Trim() ?? "",
                        NarrationShort = row.NarrationShort?.Trim() ?? "",
                        NarrationLong = row.NarrationLong?.Trim() ?? ""
                    });
                }
                else
                {
                    // Legacy fallback for old API shape where only content/contentByLang exists.
                    var vi = row.ContentByLang?.Vi?.Trim();
                    if (string.IsNullOrEmpty(vi) && !string.IsNullOrEmpty(row.Content))
                        vi = row.Content.Trim();
                    if (!string.IsNullOrWhiteSpace(vi))
                        _locService.RegisterDynamicTranslation(code, "vi", PoiServerContentParser.BuildLocalization(code, "vi", vi));
                }
                n++;
            }

            Debug.WriteLine($"[SYNC] Upserted {n} POI row(s) from server");

            var targetLang = _appState.CurrentLanguage;
            var poisFromDb = await _poiQuery.GetAllAsync(cancellationToken).ConfigureAwait(false);
            var hydrated = poisFromDb
                .Select(p => CreateHydratedPoi(p, _locService.GetLocalizationResult(p.Code, targetLang)))
                .ToList();
            await RefreshPoisCollectionAsync(hydrated).ConfigureAwait(false);

            sw.Stop();
            await TrackNearbySyncAnalyticsAsync(n, sw.ElapsedMilliseconds, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[SYNC] Failed: {ex.Message}");
        }
    }

    private async Task TrackNearbySyncAnalyticsAsync(int batchItemCount, long durationMs, CancellationToken cancellationToken)
    {
        try
        {
            var ctx = await _userContext.GetAsync(cancellationToken).ConfigureAwait(false);
            var loc = _appState.CurrentLocation;
            var geoSource = loc != null ? EventGeoSource.Gps : EventGeoSource.Unknown;
            _eventTracker.Track(new TranslationEvent
            {
                RequestId = Guid.NewGuid().ToString("N"),
                SessionId = _trackingSession.SessionId,
                PoiCode = "",
                Language = "",
                UserType = ctx.UserType,
                UserId = ctx.UserId,
                DeviceId = ctx.DeviceId,
                Status = TranslationEventStatus.AppEvent,
                DurationMs = durationMs,
                Timestamp = DateTimeOffset.UtcNow,
                Source = "nearby_sync",
                ActionType = EventActionKind.Manual,
                NetworkType = NetworkTypeResolver.Resolve(),
                FetchTriggered = true,
                UserApproved = null,
                Latitude = loc?.Latitude,
                Longitude = loc?.Longitude,
                GeoRadiusMeters = null,
                GeoSource = geoSource,
                BatchItemCount = batchItemCount
            });
        }
        catch
        {
            // analytics only
        }
    }

    private sealed class NearbySyncItem
    {
        public string? Code { get; set; }
        public string? Content { get; set; }
        public NearbyLoc? Location { get; set; }
        public NearbyLang? ContentByLang { get; set; }
        public double Radius { get; set; }
        public int Priority { get; set; }
        public string? Name { get; set; }
        public string? Summary { get; set; }
        public string? NarrationShort { get; set; }
        public string? NarrationLong { get; set; }
    }

    private sealed class NearbyLoc
    {
        public double Lat { get; set; }
        public double Lng { get; set; }
    }

    private sealed class NearbyLang
    {
        public string? Vi { get; set; }
        public string? En { get; set; }
    }

}
