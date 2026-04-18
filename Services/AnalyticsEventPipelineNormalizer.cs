using MauiApp1.Models;

namespace MauiApp1.Services;

/// <summary>Single place for analytics event field coercion (tracker + buffer load).</summary>
public static class AnalyticsEventPipelineNormalizer
{
    public static long NormalizeDurationMs(long value) => value < 0 ? 0 : value;

    public static EventActionKind NormalizeActionKind(EventActionKind value) =>
        value == default ? EventActionKind.Unknown : value;

    public static EventGeoSource NormalizeGeoSource(EventGeoSource value) =>
        value == default ? EventGeoSource.Unknown : value;
}
