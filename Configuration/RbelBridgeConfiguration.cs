namespace MauiApp1.Configuration;

/// <summary>
/// 7.3.1 RBEL client bridge — optional ingest key for <c>X-Api-Key</c> when the user is not JWT-authenticated (guest telemetry).
/// Does not affect 7.2 runtime kernels.
/// </summary>
public static class RbelBridgeConfiguration
{
    /// <summary>When false, the dispatcher no-ops (no HTTP, minimal ROEL polling work).</summary>
    public static bool IsEnabled { get; set; } = true;

    /// <summary>Optional shared secret; must match server <c>INTELLIGENCE_INGEST_API_KEY</c> for guest ingestion.</summary>
    public static string? IntelligenceIngestApiKey { get; set; }
}
