using System.Diagnostics;
namespace MauiApp1.Services;

/// <summary>
/// Sends device online/offline presence to backend so admin can monitor active devices.
/// </summary>
public sealed class DevicePresenceService
{
    private const string DeviceIdKey = "vngo_presence_device_id";
    private readonly ApiService _apiService;

    public DevicePresenceService(ApiService apiService)
    {
        _apiService = apiService;
    }

    public async Task SendHeartbeatAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            var payload = new
            {
                deviceId = GetOrCreateDeviceId(),
                deviceName = DeviceInfo.Current.Name,
                manufacturer = DeviceInfo.Current.Manufacturer,
                model = DeviceInfo.Current.Model,
                platform = DeviceInfo.Current.Platform.ToString(),
                osVersion = DeviceInfo.Current.VersionString,
                appVersion = AppInfo.Current.VersionString
            };

            using var response = await _apiService
                .PostAsJsonAsync("devices/heartbeat", payload, cancellationToken)
                .ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
                Debug.WriteLine($"[PRESENCE] Heartbeat failed: {(int)response.StatusCode} {body}");
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[PRESENCE] Heartbeat error: {ex.Message}");
        }
    }

    public async Task SendOfflineAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            var payload = new { deviceId = GetOrCreateDeviceId() };
            using var response = await _apiService
                .PostAsJsonAsync("devices/offline", payload, cancellationToken)
                .ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
                Debug.WriteLine($"[PRESENCE] Offline failed: {(int)response.StatusCode} {body}");
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[PRESENCE] Offline error: {ex.Message}");
        }
    }

    private static string GetOrCreateDeviceId()
    {
        var current = Preferences.Default.Get(DeviceIdKey, string.Empty);
        if (!string.IsNullOrWhiteSpace(current)) return current;

        var next = Guid.NewGuid().ToString("N");
        Preferences.Default.Set(DeviceIdKey, next);
        return next;
    }
}
