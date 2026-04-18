using MauiApp1.Services;
using MauiApp1.Services.Observability;
using Microsoft.Maui.Controls;

namespace MauiApp1.Services.Chaos;

/// <summary>PCSL — stress before ROEL/navigation. Pass-through when chaos disabled or Release.</summary>
public sealed class ChaosNavigationService : INavigationService
{
    private readonly ObservingNavigationService _inner;

    public ChaosNavigationService(ObservingNavigationService inner) => _inner = inner;

    public Task PushModalAsync(Page page, bool animated = true) => _inner.PushModalAsync(page, animated);

    public Task PopModalAsync(bool animated = true) => _inner.PopModalAsync(animated);

    public async Task NavigateToAsync(string route, bool animated = true)
    {
#if DEBUG
        if (ChaosSimulationOptions.IsEnabled
            && ChaosSimulationOptions.ActiveModes.HasFlag(ChaosSimulationFlags.NavStorm))
        {
            for (var i = 0; i < 4; i++)
            {
                await _inner.NavigateToAsync(route, animated).ConfigureAwait(false);
                await Task.Delay(Random.Shared.Next(2, 12)).ConfigureAwait(false);
            }

            return;
        }
#endif
        await _inner.NavigateToAsync(route, animated).ConfigureAwait(false);
    }

    public Task NavigateToAsync(string route, IDictionary<string, object>? parameters, bool animated = true)
        => _inner.NavigateToAsync(route, parameters, animated);

    public Task GoBackAsync(bool animated = true) => _inner.GoBackAsync(animated);
}
