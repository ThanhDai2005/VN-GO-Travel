// =============================================================================
// SINGLE SOURCE OF TRUTH — EventContractV1 (6.7.4)
// Do not add second contract definitions. All DTOs, enums, validator, and JSON
// schema text are generated from this file by ContractSourceGenerator.
// =============================================================================

namespace ContractDefinition.Core;

/// <summary>CLR kinds for wire fields (drives generated DTO property types).</summary>
public enum ClrWireKind
{
    String,
    Int64,
    Int32,
    Double,
    Boolean,
    DateTimeOffset,
    Enum
}

/// <summary>One JSON property on the v1 wire contract.</summary>
public readonly record struct WireField(
    string JsonName,
    ClrWireKind Clr,
    bool Nullable,
    string PropertyName,
    string? EnumTypeName = null);

/// <summary>One enum type on the wire (JSON string values).</summary>
public readonly record struct WireEnum(string Name, WireEnumMember[] Members);

/// <summary>One enum member: CLR name + exact JSON string on the wire.</summary>
public readonly record struct WireEnumMember(string ClrName, string JsonWireName);

/// <summary>
/// Canonical contract metadata and tables consumed by the source generator.
/// </summary>
public static class EventContractV1
{
    public const string Version = "v1";
    public const string VersionPropertyName = "contractVersion";

    /// <summary>Ordered wire fields for v1 (must stay aligned with Mongo / analytics expectations).</summary>
    public static readonly WireField[] Fields =
    [
        new WireField(JsonName: "contractVersion", Clr: ClrWireKind.String, Nullable: true, PropertyName: "ContractVersion"),
        new WireField(JsonName: "eventId", Clr: ClrWireKind.String, Nullable: true, PropertyName: "EventId"),
        new WireField(JsonName: "requestId", Clr: ClrWireKind.String, Nullable: true, PropertyName: "RequestId"),
        new WireField(JsonName: "sessionId", Clr: ClrWireKind.String, Nullable: true, PropertyName: "SessionId"),
        new WireField(JsonName: "poiCode", Clr: ClrWireKind.String, Nullable: true, PropertyName: "PoiCode"),
        new WireField(JsonName: "language", Clr: ClrWireKind.String, Nullable: true, PropertyName: "Language"),
        new WireField(JsonName: "userType", Clr: ClrWireKind.Enum, Nullable: false, PropertyName: "UserType", EnumTypeName: "EventUserTier"),
        new WireField(JsonName: "userId", Clr: ClrWireKind.String, Nullable: true, PropertyName: "UserId"),
        new WireField(JsonName: "deviceId", Clr: ClrWireKind.String, Nullable: true, PropertyName: "DeviceId"),
        new WireField(JsonName: "status", Clr: ClrWireKind.String, Nullable: true, PropertyName: "Status"),
        new WireField(JsonName: "durationMs", Clr: ClrWireKind.Int64, Nullable: false, PropertyName: "DurationMs"),
        new WireField(JsonName: "timestamp", Clr: ClrWireKind.DateTimeOffset, Nullable: false, PropertyName: "Timestamp"),
        new WireField(JsonName: "source", Clr: ClrWireKind.String, Nullable: true, PropertyName: "Source"),
        new WireField(JsonName: "actionType", Clr: ClrWireKind.Enum, Nullable: false, PropertyName: "ActionType", EnumTypeName: "EventActionKind"),
        new WireField(JsonName: "networkType", Clr: ClrWireKind.String, Nullable: true, PropertyName: "NetworkType"),
        new WireField(JsonName: "userApproved", Clr: ClrWireKind.Boolean, Nullable: true, PropertyName: "UserApproved"),
        new WireField(JsonName: "fetchTriggered", Clr: ClrWireKind.Boolean, Nullable: false, PropertyName: "FetchTriggered"),
        new WireField(JsonName: "latitude", Clr: ClrWireKind.Double, Nullable: true, PropertyName: "Latitude"),
        new WireField(JsonName: "longitude", Clr: ClrWireKind.Double, Nullable: true, PropertyName: "Longitude"),
        new WireField(JsonName: "geoRadiusMeters", Clr: ClrWireKind.Double, Nullable: true, PropertyName: "GeoRadiusMeters"),
        new WireField(JsonName: "geoSource", Clr: ClrWireKind.Enum, Nullable: false, PropertyName: "GeoSource", EnumTypeName: "EventGeoSource"),
        new WireField(JsonName: "batchItemCount", Clr: ClrWireKind.Int32, Nullable: true, PropertyName: "BatchItemCount"),
    ];

    /// <summary>Wire enums for v1 (member order defines numeric values in generated C# enums).</summary>
    public static readonly WireEnum[] Enums =
    [
        new WireEnum(
            Name: "EventActionKind",
            Members:
            [
                new WireEnumMember("Unknown", "unknown"),
                new WireEnumMember("Scan", "scan"),
                new WireEnumMember("Navigate", "navigate"),
                new WireEnumMember("Geofence", "geofence"),
                new WireEnumMember("DeepLink", "deepLink"),
                new WireEnumMember("Manual", "manual"),
            ]),
        new WireEnum(
            Name: "EventGeoSource",
            Members:
            [
                new WireEnumMember("Unknown", "unknown"),
                new WireEnumMember("Gps", "gps"),
                new WireEnumMember("Qr", "qr"),
                new WireEnumMember("Db", "db"),
            ]),
        new WireEnum(
            Name: "EventUserTier",
            Members:
            [
                new WireEnumMember("Guest", "guest"),
                new WireEnumMember("User", "user"),
            ]),
    ];
}
