using Microsoft.Maui.Devices.Sensors;
using Microsoft.Maui.ApplicationModel;

namespace MauiApp1.Services;

public class LocationService
{
    private bool _permissionGranted;

    public async Task<Location?> GetCurrentLocationAsync()
    {
        if (!_permissionGranted)
        {
            var status = await Permissions.RequestAsync<Permissions.LocationWhenInUse>();
            if (status != PermissionStatus.Granted)
            {
                await MainThread.InvokeOnMainThreadAsync(async () =>
                {
                    if (Application.Current?.MainPage != null)
                    {
                        await Application.Current.MainPage.DisplayAlertAsync(
                            "Permission",
                            "Cần cấp quyền vị trí để sử dụng app",
                            "OK");
                    }
                });

                return null;
            }

            _permissionGranted = true;
        }

        return await Geolocation.GetLocationAsync(
            new GeolocationRequest(GeolocationAccuracy.High, TimeSpan.FromSeconds(10))
        );
    }
}