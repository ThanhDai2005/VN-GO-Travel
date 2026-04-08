namespace MauiApp1.Models;

public class PoiEntryRequest
{
    public string? RawInput { get; set; }
    public PoiEntrySource Source { get; set; }
    public string? PreferredLanguage { get; set; }

    /// <summary>Deep links and manual entry default to detail; QR camera uses <see cref="PoiNavigationMode.Map"/>.</summary>
    public PoiNavigationMode NavigationMode { get; set; } = PoiNavigationMode.Detail;
}
