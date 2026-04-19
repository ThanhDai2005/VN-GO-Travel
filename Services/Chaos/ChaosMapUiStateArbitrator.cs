using MauiApp1.Models;
using MauiApp1.Services.MapUi;
using MauiApp1.Services.Observability;

namespace MauiApp1.Services.Chaos;

/// <summary>PCSL — stress before ROEL/MSAL. Pass-through when chaos disabled or Release.</summary>
public sealed class ChaosMapUiStateArbitrator : IMapUiStateArbitrator
{
    private readonly ObservingMapUiStateArbitrator _inner;

    public ChaosMapUiStateArbitrator(ObservingMapUiStateArbitrator inner) => _inner = inner;

    public async Task ApplySelectedPoiAsync(MapUiSelectionSource source, Poi? poi, CancellationToken cancellationToken = default)
    {
#if DEBUG
        if (ChaosSimulationOptions.IsEnabled
            && ChaosSimulationOptions.ActiveModes.HasFlag(ChaosSimulationFlags.UiSpam))
        {
            for (var i = 0; i < 5; i++)
                await _inner.ApplySelectedPoiAsync(source, poi, cancellationToken).ConfigureAwait(false);

            return;
        }
#endif
        await _inner.ApplySelectedPoiAsync(source, poi, cancellationToken).ConfigureAwait(false);
    }

    public async Task ApplySelectedPoiByCodeAsync(MapUiSelectionSource source, string? code, CancellationToken cancellationToken = default)
    {
#if DEBUG
        if (ChaosSimulationOptions.IsEnabled
            && ChaosSimulationOptions.ActiveModes.HasFlag(ChaosSimulationFlags.UiSpam))
        {
            for (var i = 0; i < 5; i++)
                await _inner.ApplySelectedPoiByCodeAsync(source, code, cancellationToken).ConfigureAwait(false);

            return;
        }
#endif
        await _inner.ApplySelectedPoiByCodeAsync(source, code, cancellationToken).ConfigureAwait(false);
    }
}
