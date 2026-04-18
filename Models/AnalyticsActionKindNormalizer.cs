namespace MauiApp1.Models;

/// <summary>Maps historical / producer strings to <see cref="EventActionKind"/>.</summary>
public static class AnalyticsActionKindNormalizer
{
    public static EventActionKind FromLegacyString(string? raw)
    {
        var s = (raw ?? "").Trim().ToLowerInvariant();
        return s switch
        {
            "" => EventActionKind.Unknown,
            "scan" => EventActionKind.Scan,
            "navigate" => EventActionKind.Navigate,
            "geofence" => EventActionKind.Geofence,
            "deeplink" or "deep_link" => EventActionKind.DeepLink,
            "manual" => EventActionKind.Manual,
            // legacy producers (pre-6.7.1)
            "translate" or "fetch" => EventActionKind.Manual,
            "view" => EventActionKind.Navigate,
            _ => EventActionKind.Unknown
        };
    }

    public static string ToJsonName(EventActionKind value) =>
        value switch
        {
            EventActionKind.Scan => "scan",
            EventActionKind.Navigate => "navigate",
            EventActionKind.Geofence => "geofence",
            EventActionKind.DeepLink => "deepLink",
            EventActionKind.Manual => "manual",
            _ => "unknown"
        };
}
