namespace MauiApp1.Models;

/// <summary>
/// Holds all localizable text content for a single POI in one specific language.
/// This model is the target destination for text data currently flattened into <see cref="Poi"/>.
/// <para>
/// <b>Phase 2:</b> This class will become a SQLite entity (<c>[Table("poi_localizations")]</c>)
/// and replace the legacy text columns in the <c>pois</c> table.
/// </para>
/// </summary>
public class PoiLocalization
{
    /// <summary>
    /// POI code — matches <see cref="Poi.Code"/>. Acts as a logical foreign key.
    /// </summary>
    public string Code { get; set; } = "";

    /// <summary>
    /// BCP-47 language code (e.g. "en", "vi", "ja").
    /// </summary>
    public string LanguageCode { get; set; } = "";

    /// <summary>
    /// Display name shown on the map pin and bottom panel.
    /// </summary>
    public string Name { get; set; } = "";

    /// <summary>
    /// Short description displayed in the map bottom panel and POI detail header.
    /// </summary>
    public string Summary { get; set; } = "";

    /// <summary>
    /// Text read aloud by TTS when the user enters the geofence radius.
    /// Falls back to <see cref="Name"/> if empty.
    /// </summary>
    public string NarrationShort { get; set; } = "";

    /// <summary>
    /// Full narration text displayed and read on the POI detail screen.
    /// Falls back to <see cref="NarrationShort"/> if empty.
    /// </summary>
    public string NarrationLong { get; set; } = "";
}
