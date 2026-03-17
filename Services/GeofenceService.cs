using MauiApp1.Models;
using Microsoft.Maui.Devices.Sensors;

namespace MauiApp1.Services;

public class GeofenceService
{
    private readonly AudioService _audioService;
    private List<Poi> _pois = new();
    private readonly HashSet<string> _alreadyTriggered = new();
    private readonly SemaphoreSlim _gate = new(1, 1);
    public string CurrentLanguage { get; set; } = "vi";

    public GeofenceService(AudioService audioService)
    {
        _audioService = audioService;
    }

    public void UpdatePois(IEnumerable<Poi> pois)
    {
        _pois = pois.ToList();
        _alreadyTriggered.Clear();
    }

    public async Task CheckLocationAsync(Location location)
    {
        if (!await _gate.WaitAsync(0)) return; // đang chạy thì bỏ qua tick này
        try
        {
            foreach (var poi in _pois.OrderByDescending(p => p.Priority))
            {
                var distanceMeters = DistanceInMeters(
                    location.Latitude, location.Longitude,
                    poi.Latitude, poi.Longitude
                );

                if (distanceMeters <= poi.Radius)
                {
                    if (_alreadyTriggered.Contains(poi.Code)) continue;

                    // Use flattened NarrationShort for geofence-triggered audio, fallback to Name
                    var text = !string.IsNullOrWhiteSpace(poi.NarrationShort) ? poi.NarrationShort : poi.Name;

                    if (!string.IsNullOrWhiteSpace(text))
                        await _audioService.SpeakAsync(text, CurrentLanguage);

                    _alreadyTriggered.Add(poi.Code);
                }
                else if (distanceMeters > poi.Radius * 1.2)
                {
                    _alreadyTriggered.Remove(poi.Code);
                }
            }
        }
        finally
        {
            _gate.Release();
        }
    }


    // Haversine formula
    private static double DistanceInMeters(double lat1, double lon1, double lat2, double lon2)
    {
        double R = 6371000; // radius earth meters
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