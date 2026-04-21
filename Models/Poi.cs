using SQLite;

namespace MauiApp1.Models;

/// <summary>
/// Represents one core Point of Interest row in SQLite.
/// Text content (name, narration, etc.) is attached at runtime via <see cref="Localization"/>.
/// </summary>
[Table("pois")]
public class Poi
{
    // ── Persisted columns (SQLite) ───────────────────────────────────────────

    /// <summary>
    /// Primary key for the current DB shape. In this MVP: one row per POI code.
    /// </summary>
    [PrimaryKey]
    public string Id { get; set; } = "";

    /// <summary>Stable POI identifier (e.g. "HCM", "HN_OLD_QUARTER").</summary>
    public string Code { get; set; } = "";

    /// <summary>
    /// When set, identifies the language of flattened text columns on this row
    /// (<see cref="Name"/>, <see cref="Summary"/>, etc.) for exact code+language queries.
    /// Core geo-only rows may leave this null.
    /// </summary>
    public string? LanguageCode { get; set; }

    public string? Name { get; set; }
    public string? Summary { get; set; }
    public string? NarrationShort { get; set; }
    public string? NarrationLong { get; set; }

    /// <summary>WGS-84 latitude of the POI center.</summary>
    public double Latitude { get; set; }

    /// <summary>WGS-84 longitude of the POI center.</summary>
    public double Longitude { get; set; }

    /// <summary>Geofence trigger radius in metres. Default: 50 m.</summary>
    public double Radius { get; set; } = 50;

    /// <summary>
    /// Relative priority used when multiple POIs overlap.
    /// Higher value wins. Default: 1.
    /// </summary>
    public int Priority { get; set; } = 1;

    // ── Non-persisted ────────────────────────────────────────────────────────

    /// <summary>
    /// Set to <see langword="true"/> when text content comes from the auto-translation
    /// cache rather than a hand-curated row in <c>pois</c>.
    /// Not stored in the database.
    /// </summary>
    [Ignore]
    public bool IsAutoTranslated { get; set; }

    /// <summary>
    /// Indicates if the localization text was loaded using a fallback language because
    /// the requested language was not available. Helps UI display transparency info.
    /// </summary>
    [Ignore]
    public bool IsFallback { get; set; }

    /// <summary>
    /// The language code of the loaded text content (e.g. "vi" or "en").
    /// Matches <see cref="IsFallback"/> context.
    /// </summary>
    [Ignore]
    public string UsedLanguage { get; set; } = "";

    /// <summary>
    /// The original language requested by the system/user before any fallback occurred.
    /// </summary>
    [Ignore]
    public string RequestedLanguage { get; set; } = "";

    /// <summary>
    /// Indicates if a background translation is currently in progress for this POI.
    /// </summary>
    [Ignore]
    public bool IsTranslating { get; set; }

    // ── Navigation property ──────────────────────────────────────────────────

    /// <summary>
    /// Localized text content for this POI.
    /// </summary>
    [Ignore]
    public PoiLocalization? Localization { get; set; }
}