namespace MauiApp1.Configuration;

/// <summary>
/// Base URL for the Node backend (<c>/api/v1/</c> prefix). Adjust per environment.
/// </summary>
public static class BackendApiConfiguration
{
#if DEBUG && ANDROID
    /// <summary>
    /// NGROK TUNNEL MODE: Khi điện thoại và laptop khác mạng, dùng ngrok để tạo tunnel công khai.
    ///
    /// Cách dùng:
    /// 1. Chạy backend: cd admin-web &amp;&amp; npm run dev
    /// 2. Chạy ngrok: ngrok http 3000
    /// 3. Copy URL ngrok (vd: ngrok config add-authtoken 3CiVEcxnwHB6xmmc1Lzq7ltfyZ8_4rF8TvpbgsDa2tkkozwee)
    /// 4. Paste vào NgrokTunnelUrl bên dưới
    /// 5. Set UseNgrokTunnel = true
    ///
    /// Khi cùng mạng Wi-Fi:
    /// - Set UseNgrokTunnel = false
    /// - Dùng LocalNetworkHost (IP máy Windows từ ipconfig)
    /// </summary>
    private const bool UseNgrokTunnel = true;
    
    // WARNING: If you get a 404 error, your ngrok tunnel might have expired or pointing to the wrong port.
    // Ensure you run 'ngrok http 3000' and paste the NEW URL here.
    private const string NgrokTunnelUrl = "https://repugnant-liberty-dragging.ngrok-free.dev"; 
    private const string LocalNetworkHost = "192.168.1.5"; // IP máy Windows khi cùng mạng


    public static string BaseUrl { get; set; } = UseNgrokTunnel
        ? $"{NgrokTunnelUrl}/api/v1/"
        : $"http://{LocalNetworkHost}:3000/api/v1/";
#elif DEBUG
    public static string BaseUrl { get; set; } = "http://localhost:3000/api/v1/";
#else
    public static string BaseUrl { get; set; } = "https://api.vngo-travel.com/api/v1/";
#endif
}
