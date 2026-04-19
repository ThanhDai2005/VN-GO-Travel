using System.Text.Json;
using System.Text.Json.Serialization;
using MauiApp1.Models;

namespace MauiApp1.Services;

/// <summary>Shared JSON options for <see cref="TranslationEvent"/> persistence and batch logging.</summary>
public static class TranslationEventJsonOptions
{
    public static JsonSerializerOptions Create(bool writeIndented = false)
    {
        return new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = writeIndented,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
            Converters =
            {
                new AnalyticsActionKindConverter(),
                new GeoSnapshotSourceConverter(),
                new FetchTriggeredBooleanConverter(),
                new JsonStringEnumConverter(JsonNamingPolicy.CamelCase)
            }
        };
    }
}
