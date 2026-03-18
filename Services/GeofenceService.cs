using MauiApp1.Models;
using Microsoft.Maui.Devices.Sensors;

namespace MauiApp1.Services;

public class GeofenceService
{
    private readonly AudioService _audioService;
    private List<Poi> _pois = new();
    private readonly SemaphoreSlim _gate = new(1, 1);
    private string? _currentActivePoiId;

    public string CurrentLanguage { get; set; } = "vi";

    public GeofenceService(AudioService audioService)
    {
        _audioService = audioService;
    }

    public void UpdatePois(IEnumerable<Poi> pois)
    {
        _pois = pois.ToList();
        _currentActivePoiId = null;
    }

    public async Task CheckLocationAsync(Location location)
    {
        if (!await _gate.WaitAsync(0)) return;

        try
        {
            var best = _pois
                .Select(p => new
                {
                    Poi = p,
                    Distance = DistanceInMeters(
                        location.Latitude, location.Longitude,
                        p.Latitude, p.Longitude)
                })
                .Where(x => x.Distance <= x.Poi.Radius)
                .OrderByDescending(x => x.Poi.Priority)
                .ThenBy(x => x.Distance)
                .FirstOrDefault();

            if (best != null)
            {
                var poi = best.Poi;

                if (_currentActivePoiId != poi.Id)
                {
                    _currentActivePoiId = poi.Id;

                    var text = !string.IsNullOrWhiteSpace(poi.NarrationShort)
                        ? poi.NarrationShort
                        : poi.Name;

                    await _audioService.SpeakAsync(text, CurrentLanguage);
                }
            }
            else
            {
                _currentActivePoiId = null;
            }
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