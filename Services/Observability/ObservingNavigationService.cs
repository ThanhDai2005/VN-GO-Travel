using MauiApp1.Services;
using Microsoft.Maui.Controls;

namespace MauiApp1.Services.Observability;

/// <summary>ROEL decorator — forwards 100% to inner navigation service.</summary>
public sealed class ObservingNavigationService : INavigationService
{
    private readonly NavigationService _inner;
    private readonly IRuntimeTelemetry _telemetry;

    public ObservingNavigationService(NavigationService inner, IRuntimeTelemetry telemetry)
    {
        _inner = inner;
        _telemetry = telemetry;
    }

    public Task PushModalAsync(Page page, bool animated = true)
    {
        if (page == null) return Task.CompletedTask;

        _telemetry.TryEnqueue(new RuntimeTelemetryEvent(
            RuntimeTelemetryEventKind.NavigationExecuted,
            DateTime.UtcNow.Ticks,
            routeOrAction: nameof(PushModalAsync),
            detail: page.GetType().Name));
        return _inner.PushModalAsync(page, animated);
    }

    public Task PopModalAsync(bool animated = true)
    {
        _telemetry.TryEnqueue(new RuntimeTelemetryEvent(
            RuntimeTelemetryEventKind.NavigationExecuted,
            DateTime.UtcNow.Ticks,
            routeOrAction: nameof(PopModalAsync)));
        return _inner.PopModalAsync(animated);
    }

    public Task NavigateToAsync(string route, bool animated = true)
    {
        _telemetry.TryEnqueue(new RuntimeTelemetryEvent(
            RuntimeTelemetryEventKind.NavigationExecuted,
            DateTime.UtcNow.Ticks,
            routeOrAction: route,
            detail: nameof(NavigateToAsync)));
        return _inner.NavigateToAsync(route, animated);
    }

    public Task NavigateToAsync(string route, IDictionary<string, object>? parameters, bool animated = true)
    {
        _telemetry.TryEnqueue(new RuntimeTelemetryEvent(
            RuntimeTelemetryEventKind.NavigationExecuted,
            DateTime.UtcNow.Ticks,
            routeOrAction: route,
            detail: parameters == null ? "no-params" : $"params={parameters.Count}"));
        return _inner.NavigateToAsync(route, parameters, animated);
    }

    public Task GoBackAsync(bool animated = true)
    {
        _telemetry.TryEnqueue(new RuntimeTelemetryEvent(
            RuntimeTelemetryEventKind.NavigationExecuted,
            DateTime.UtcNow.Ticks,
            routeOrAction: nameof(GoBackAsync)));
        return _inner.GoBackAsync(animated);
    }
}
