using SQLite;
using System.Diagnostics;

namespace MauiApp1.Models;

/// <summary>
/// Represents a Point of Interest with geographic and behavioral metadata.
/// Text content (name, narration, etc.) is stored in <see cref="Localization"/>.
/// </summary>
[Table("pois")]
public class Poi
{
    // ── Persisted columns (SQLite) ───────────────────────────────────────────

    /// <summary>
    /// Primary key. Format: <c>{Code}_{LanguageCode}</c> (e.g. "HCM_en").
    /// </summary>
    [PrimaryKey]
    public string Id { get; set; } = "";

    /// <summary>Stable POI identifier (e.g. "HCM", "HN_OLD_QUARTER").</summary>
    public string Code { get; set; } = "";

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

    // ── Navigation property ──────────────────────────────────────────────────

    /// <summary>
    /// Localized text content for this POI.
    /// </summary>
    [Ignore]
    public PoiLocalization? Localization { get; set; }
}