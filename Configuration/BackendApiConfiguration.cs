namespace MauiApp1.Configuration;

/// <summary>
/// Base URL for the Node backend (<c>/api/v1/</c> prefix). Adjust per environment.
/// </summary>
public static class BackendApiConfiguration
{
#if DEBUG && ANDROID
    /// <summary>
    /// Trên điện thoại thật (Samsung, …), <b>localhost</b> là chính điện thoại — không trỏ tới PC chạy backend.
    /// Đổi hằng số này:
    /// <list type="bullet">
    /// <item><description>Android Emulator → <c>10.0.2.2</c> (mặc định).</description></item>
    /// <item><description>Điện thoại + Wi‑Fi: IPv4 của máy Windows (<c>ipconfig</c>), PC và điện thoại cùng mạng.</description></item>
    /// <item><description>USB: chạy <c>adb reverse tcp:3000 tcp:3000</c> rồi dùng <c>127.0.0.1</c>.</description></item>
    /// </list>
    /// </summary>
    // Emulator: "10.0.2.2". Điện thoại thật (Samsung, …) + Wi‑Fi: đổi thành IPv4 máy Windows (CMD: ipconfig).
    private const string AndroidDevApiHost = "10.186.18.125";

    public static string BaseUrl { get; set; } = $"http://{AndroidDevApiHost}:3000/api/v1/";
#elif DEBUG
    public static string BaseUrl { get; set; } = "http://localhost:3000/api/v1/";
#else
    public static string BaseUrl { get; set; } = "https://api.vngo-travel.com/api/v1/";
#endif
}
