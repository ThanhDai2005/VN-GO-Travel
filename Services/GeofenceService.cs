using MauiApp1.Models;
using Microsoft.Maui.Devices.Sensors;
using System.Diagnostics;

namespace MauiApp1.Services;

public class GeofenceService
{
    private readonly AudioService _audioService;
    private List<Poi> _pois = new();
    private readonly SemaphoreSlim _gate = new(1, 1);
    private string? _currentActivePoiId;
    private readonly Dictionary<string, DateTime> _lastTriggeredAt = new();

    // Tunable thresholds
    private const double MIN_MOVEMENT_METERS = 5.0; // ignore tiny GPS jitter
    private const int MIN_LOCATION_INTERVAL_MS = 1000; // minimum interval between location evaluations
    private const int TRIGGER_COOLDOWN_MS = 120_000; // 2 minutes cooldown per POI

    private double? _lastLat;
    private double? _lastLon;
    private DateTime _lastLocationTime = DateTime.MinValue;

    public string CurrentLanguage { get; set; } = "vi";

    public GeofenceService(AudioService audioService)
    {
        _audioService = audioService;
    }

    public void UpdatePois(IEnumerable<Poi> pois)
    {
        _pois = pois.ToList();
        _currentActivePoiId = null;
        lock (_lastTriggeredAt)
            _lastTriggeredAt.Clear();
    }

    public async Task CheckLocationAsync(Location location)
    {
        // Quick sanity
        if (location == null) return;

        var now = DateTime.UtcNow;

        // Throttle too-frequent checks and ignore tiny movements to reduce jitter
        if (_lastLocationTime != DateTime.MinValue)
        {
            var elapsed = (now - _lastLocationTime).TotalMilliseconds;
            if (elapsed < MIN_LOCATION_INTERVAL_MS)
            {
                Debug.WriteLine($"[GEOFENCE] Skipping check: interval {elapsed}ms < {MIN_LOCATION_INTERVAL_MS}ms");
                return;
            }

            if (_lastLat.HasValue && _lastLon.HasValue)
            {
                var moved = DistanceInMeters(_lastLat.Value, _lastLon.Value, location.Latitude, location.Longitude);
                if (moved < MIN_MOVEMENT_METERS)
                {
                    Debug.WriteLine($"[GEOFENCE] Skipping check: moved {moved:0.0}m < {MIN_MOVEMENT_METERS}m");
                    _lastLocationTime = now; // update time to avoid tight loops
                    return;
                }
            }
        }

        _lastLat = location.Latitude;
        _lastLon = location.Longitude;
        _lastLocationTime = now;

        if (!await _gate.WaitAsync(0))
        {
            Debug.WriteLine("[GEOFENCE] Skipping check: gate busy");
            return;
        }

        try
        {
            Debug.WriteLine($"[GEOFENCE] Location received lat={location.Latitude:0.000000} lon={location.Longitude:0.000000} at {now:O}");

            // Evaluate candidate POIs within their radius
            var candidates = _pois
                .Select(p => new { Poi = p, Distance = DistanceInMeters(location.Latitude, location.Longitude, p.Latitude, p.Longitude) })
                .Where(x => x.Distance <= x.Poi.Radius)
                .OrderByDescending(x => x.Poi.Priority)
                .ThenBy(x => x.Distance)
                .ToList();

            Debug.WriteLine($"[GEOFENCE] Candidates count={candidates.Count}");
            foreach (var c in candidates)
            {
                Debug.WriteLine($"[GEOFENCE] Candidate id={c.Poi.Id} code={c.Poi.Code} dist={c.Distance:0.0}m pri={c.Poi.Priority}");
            }

            if (candidates.Count == 0)
            {
                if (_currentActivePoiId != null)
                {
                    Debug.WriteLine($"[GEOFENCE] Exiting POI {_currentActivePoiId}");
                    _currentActivePoiId = null;
                }

                return;
            }

            var best = candidates.First();
            var poi = best.Poi;

            // Decide whether to trigger narration
            var shouldTrigger = false;
            var reason = "";

            if (_currentActivePoiId == poi.Id)
            {
                reason = "already active";
                shouldTrigger = false;
            }
            else
            {
                // Check cooldown for this POI
                lock (_lastTriggeredAt)
                {
                    if (_lastTriggeredAt.TryGetValue(poi.Id, out var last))
                    {
                        var since = (now - last).TotalMilliseconds;
                        if (since < TRIGGER_COOLDOWN_MS)
                        {
                            reason = $"cooldown {since:0}ms<{TRIGGER_COOLDOWN_MS}ms";
                            shouldTrigger = false;
                        }
                        else
                        {
                            shouldTrigger = true;
                        }
                    }
                    else
                    {
                        shouldTrigger = true;
                    }
                }
            }

            if (!shouldTrigger)
            {
                Debug.WriteLine($"[GEOFENCE] Trigger suppressed for poi={poi.Id} reason={reason}");
                return;
            }

            // Trigger narration
            _currentActivePoiId = poi.Id;
            lock (_lastTriggeredAt)
            {
                _lastTriggeredAt[poi.Id] = now;
            }

            var text = !string.IsNullOrWhiteSpace(poi.Localization?.NarrationShort) ? poi.Localization.NarrationShort : (poi.Localization?.Name ?? "");
            Debug.WriteLine($"[GEOFENCE] Triggering POI id={poi.Id} code={poi.Code} textLen={text?.Length ?? 0}");
            await _audioService.SpeakAsync(poi.Code, text, CurrentLanguage);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[GEOFENCE] Error in CheckLocationAsync: {ex}");
        }
        finally
        {
            _gate.Release();
        }
    }

    private static double DistanceInMeters(double lat1, double lon1, double lat2, double lon2)
    {
        double R = 6371000;
        double dLat = ToRad(lat2 - lat1);
        double dLon = ToRad(lon2 - lon1);

        double a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                   Math.Cos(ToRad(lat1)) * Math.Cos(ToRad(lat2)) *
                   Math.Sin(dLon / 2) * Math.Sin(dLon / 2);

        double c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
        return R * c;
    }

    private static double ToRad(double deg) => deg * (Math.PI / 180.0);
}
