namespace MauiApp1.Services.Chaos;

/// <summary>PCSL (7.2.7) — controlled chaos flags. Effective only in DEBUG builds.</summary>
[Flags]
public enum ChaosSimulationFlags : uint
{
    None = 0,
    GpsJitter = 1 << 0,
    GpsBurst = 1 << 1,
    GpsDelay = 1 << 2,
    /// <summary>Test-only: deliver two samples with inverted inter-arrival delays (boundary stress).</summary>
    GpsReorder = 1 << 3,
    UiSpam = 1 << 4,
    NavStorm = 1 << 5,
    ConcurrencyBurst = 1 << 6,
    TelemetryFlood = 1 << 7,
}

/// <summary>Global chaos arm switch. Release builds cannot enable chaos.</summary>
public static class ChaosSimulationOptions
{
#if DEBUG
    public static bool IsEnabled { get; set; }
#else
    public static bool IsEnabled => false;
#endif

    public static ChaosSimulationFlags ActiveModes { get; set; }

    public static void Reset()
    {
        ActiveModes = ChaosSimulationFlags.None;
#if DEBUG
        IsEnabled = false;
#endif
    }
}
