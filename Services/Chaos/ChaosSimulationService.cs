using System.Diagnostics;
using Microsoft.Extensions.Logging;

namespace MauiApp1.Services.Chaos;

/// <summary>PCSL control surface — DEBUG arms chaos; Release is a no-op.</summary>
public sealed class ChaosSimulationService
{
    private readonly ILogger<ChaosSimulationService>? _logger;

    public ChaosSimulationService(ILogger<ChaosSimulationService>? logger = null) => _logger = logger;

    public void Arm(ChaosSimulationFlags modes, bool enabled = true)
    {
#if DEBUG
        ChaosSimulationOptions.ActiveModes = modes;
        ChaosSimulationOptions.IsEnabled = enabled;
        _logger?.LogWarning("[PCSL] Chaos armed modes={Modes} enabled={Enabled}", modes, enabled);
        Debug.WriteLine($"[PCSL] Chaos armed modes={modes} enabled={enabled}");
#else
        _ = modes;
        _ = enabled;
#endif
    }

    public void Disarm()
    {
        ChaosSimulationOptions.Reset();
#if DEBUG
        _logger?.LogWarning("[PCSL] Chaos disarmed");
        Debug.WriteLine("[PCSL] Chaos disarmed");
#endif
    }
}
