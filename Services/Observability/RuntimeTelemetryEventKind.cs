namespace MauiApp1.Services.Observability;

/// <summary>ROEL (7.2.6) — lightweight runtime telemetry kinds (no business semantics).</summary>
public enum RuntimeTelemetryEventKind : byte
{
    GpsTickReceived = 1,
    /// <summary>GAK publish completed (coalescing outcome is inferred vs <see cref="GeofenceEvaluated"/> frequency).</summary>
    LocationPublishCompleted = 2,
    GeofenceEvaluated = 3,
    /// <summary>MSAL apply invoked (suppression inferred in replay by comparing with UI state).</summary>
    MsalApplyInvoked = 4,
    UiStateCommitted = 5,
    NavigationExecuted = 6,
    /// <summary>Passive: duplicate GPS sample observed at wrapper (inner still invoked).</summary>
    PotentialDuplicateGpsObserved = 10,
    TelemetryDropped = 11,
    PerformanceAnomaly = 12,
}
