using Microsoft.Maui.Networking;

namespace MauiApp1.Services;

/// <summary>Lightweight connectivity snapshot for analytics (no policy / retry logic).</summary>
public static class NetworkTypeResolver
{
    public static string Resolve()
    {
        try
        {
            var access = Connectivity.Current.NetworkAccess;
            if (access == NetworkAccess.None)
                return "offline";

            var profiles = Connectivity.Current.ConnectionProfiles;
            if (profiles.Contains(ConnectionProfile.WiFi))
                return "wifi";
            if (profiles.Contains(ConnectionProfile.Cellular))
                return "cellular";

            return access == NetworkAccess.Internet ? "unknown" : "offline";
        }
        catch
        {
            return "unknown";
        }
    }
}
