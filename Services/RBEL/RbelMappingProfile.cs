using MauiApp1.Models;
using MauiApp1.Services.Observability;
using GeneratedContract;

namespace MauiApp1.Services.RBEL;

/// <summary>Maps ROEL <see cref="RuntimeTelemetryEvent"/> snapshots to 7.3.0 RBEL wire events (read-only).</summary>
public static class RbelMappingProfile
{
    public const string MappingVersion = "rbel-1.0.1";

    /// <summary>Returns null when the kind is intentionally not forwarded (noise reduction).</summary>
    public static RbelWireEvent? TryMapFromRoel(
        RuntimeTelemetryEvent evt,
        UserContext user,
        RbelCorrelationScope correlation,
        long runtimeSequence,
        string sessionId)
    {
        var (family, source) = Classify(evt.Kind);
        if (family == null)
            return null;

        var correlationId = correlation.Current;

        var auth = AuthStateFromUser(user);
        var userTypeWire = UserTypeWire(user.UserType);

        DateTimeOffset ts;
        try
        {
            ts = new DateTimeOffset(new DateTime(evt.UtcTicks, DateTimeKind.Utc));
        }
        catch
        {
            ts = DateTimeOffset.UtcNow;
        }

        var payload = new Dictionary<string, object?>
        {
            ["roelKind"] = evt.Kind.ToString(),
            ["producerId"] = evt.ProducerId,
            ["detail"] = evt.Detail,
            ["routeOrAction"] = evt.RouteOrAction,
            ["poiCode"] = evt.PoiCode
        };

        if (evt.Latitude is { } lat && evt.Longitude is { } lon)
        {
            payload["latitude"] = lat;
            payload["longitude"] = lon;
        }

        if (evt.Kind == RuntimeTelemetryEventKind.NavigationExecuted)
            correlation.OnNavigationEvent();

        return new RbelWireEvent
        {
            ContractVersion = "v2",
            EventId = Guid.NewGuid().ToString("N"),
            CorrelationId = correlationId,
            SessionId = sessionId,
            DeviceId = user.DeviceId,
            UserId = user.UserId,
            AuthState = auth,
            UserType = userTypeWire,
            SourceSystem = source,
            RbelEventFamily = family,
            RbelMappingVersion = MappingVersion,
            RuntimeTickUtcTicks = evt.UtcTicks,
            RuntimeSequence = runtimeSequence,
            Timestamp = ts,
            Payload = payload,
            PoiId = evt.PoiCode
        };
    }

    private static (string? family, string source) Classify(RuntimeTelemetryEventKind kind) => kind switch
    {
        RuntimeTelemetryEventKind.LocationPublishCompleted => ("location", "GAK"),
        RuntimeTelemetryEventKind.GeofenceEvaluated => ("location", "GAK"),
        RuntimeTelemetryEventKind.UiStateCommitted => ("user_interaction", "MSAL"),
        RuntimeTelemetryEventKind.NavigationExecuted => ("navigation", "NAV"),
        RuntimeTelemetryEventKind.PotentialDuplicateGpsObserved => ("observability", "ROEL"),
        RuntimeTelemetryEventKind.TelemetryDropped => ("observability", "ROEL"),
        RuntimeTelemetryEventKind.PerformanceAnomaly => ("observability", "ROEL"),
        RuntimeTelemetryEventKind.MsalApplyInvoked => ("observability", "MSAL"),
        RuntimeTelemetryEventKind.GpsTickReceived => (null, "GAK"),
        _ => (null, "ROEL")
    };

    private static string AuthStateFromUser(UserContext ctx) => ctx.UserType switch
    {
        EventUserTier.User => "logged_in",
        _ => "guest"
    };

    private static string UserTypeWire(EventUserTier t) => t switch
    {
        EventUserTier.User => "user",
        _ => "guest"
    };
}
