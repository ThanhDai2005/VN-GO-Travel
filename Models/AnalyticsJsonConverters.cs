using System.Text.Json;
using System.Text.Json.Serialization;

namespace MauiApp1.Models;

/// <summary>Reads legacy free-text <c>actionType</c> strings and writes canonical camelCase enum names.</summary>
public sealed class AnalyticsActionKindConverter : JsonConverter<EventActionKind>
{
    public override EventActionKind Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null)
            return EventActionKind.Unknown;

        if (reader.TokenType == JsonTokenType.Number && reader.TryGetInt32(out var n))
            return Enum.IsDefined(typeof(EventActionKind), n) ? (EventActionKind)n : EventActionKind.Unknown;

        if (reader.TokenType != JsonTokenType.String)
            return EventActionKind.Unknown;

        return AnalyticsActionKindNormalizer.FromLegacyString(reader.GetString());
    }

    public override void Write(Utf8JsonWriter writer, EventActionKind value, JsonSerializerOptions options)
    {
        writer.WriteStringValue(AnalyticsActionKindNormalizer.ToJsonName(value));
    }
}

/// <summary>Reads legacy / variant geo source strings.</summary>
public sealed class GeoSnapshotSourceConverter : JsonConverter<EventGeoSource>
{
    public override EventGeoSource Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null)
            return EventGeoSource.Unknown;

        if (reader.TokenType == JsonTokenType.Number && reader.TryGetInt32(out var n))
            return Enum.IsDefined(typeof(EventGeoSource), n) ? (EventGeoSource)n : EventGeoSource.Unknown;

        if (reader.TokenType != JsonTokenType.String)
            return EventGeoSource.Unknown;

        var s = reader.GetString()?.Trim().ToLowerInvariant() ?? "";
        return s switch
        {
            "gps" => EventGeoSource.Gps,
            "qr" => EventGeoSource.Qr,
            "db" => EventGeoSource.Db,
            "manualoverride" or "manual_override" or "manual" => EventGeoSource.Db,
            "unknown" => EventGeoSource.Unknown,
            _ => EventGeoSource.Unknown
        };
    }

    public override void Write(Utf8JsonWriter writer, EventGeoSource value, JsonSerializerOptions options)
    {
        var name = value switch
        {
            EventGeoSource.Gps => "gps",
            EventGeoSource.Qr => "qr",
            EventGeoSource.Db => "db",
            _ => "unknown"
        };
        writer.WriteStringValue(name);
    }
}

/// <summary>Legacy buffers may contain <c>null</c> for <c>fetchTriggered</c>; coerce to false.</summary>
public sealed class FetchTriggeredBooleanConverter : JsonConverter<bool>
{
    public override bool Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null)
            return false;
        if (reader.TokenType == JsonTokenType.True)
            return true;
        if (reader.TokenType == JsonTokenType.False)
            return false;
        return false;
    }

    public override void Write(Utf8JsonWriter writer, bool value, JsonSerializerOptions options)
        => writer.WriteBooleanValue(value);
}
