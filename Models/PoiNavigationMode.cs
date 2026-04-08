namespace MauiApp1.Models;

/// <summary>
/// Where <see cref="PoiEntryCoordinator"/> navigates after a successful POI resolve.
/// Default <see cref="Detail"/> preserves deep links and manual entry; QR camera uses <see cref="Map"/> (map-first).
/// </summary>
public enum PoiNavigationMode
{
    Detail,
    Map
}
