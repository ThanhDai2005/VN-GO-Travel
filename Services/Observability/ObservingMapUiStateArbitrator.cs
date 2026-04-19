using MauiApp1.Models;
using MauiApp1.Services;
using MauiApp1.Services.MapUi;

namespace MauiApp1.Services.Observability;

/// <summary>ROEL decorator — forwards 100% to inner MSAL without modifying <see cref="MapUiStateArbitrator"/>.</summary>
public sealed class ObservingMapUiStateArbitrator : IMapUiStateArbitrator
{
    private readonly MapUiStateArbitrator _inner;
    private readonly IRuntimeTelemetry _telemetry;
    private readonly AppState _appState;

    public ObservingMapUiStateArbitrator(
        MapUiStateArbitrator inner,
        IRuntimeTelemetry telemetry,
        AppState appState)
    {
        _inner = inner;
        _telemetry = telemetry;
        _appState = appState;
    }

    public async Task ApplySelectedPoiAsync(MapUiSelectionSource source, Poi? poi, CancellationToken cancellationToken = default)
    {
        var before = _appState.SelectedPoi?.Code;
        var t0 = DateTime.UtcNow.Ticks;
        _telemetry.TryEnqueue(new RuntimeTelemetryEvent(
            RuntimeTelemetryEventKind.MsalApplyInvoked,
            t0,
            detail: $"src={source} before={before} req={(poi?.Code ?? "(null)")}"));

        await _inner.ApplySelectedPoiAsync(source, poi, cancellationToken).ConfigureAwait(false);

        var after = _appState.SelectedPoi?.Code;
        _telemetry.TryEnqueue(new RuntimeTelemetryEvent(
            RuntimeTelemetryEventKind.UiStateCommitted,
            DateTime.UtcNow.Ticks,
            poiCode: after,
            detail: $"src={source} before={before} after={after}"));
    }

    public async Task ApplySelectedPoiByCodeAsync(MapUiSelectionSource source, string? code, CancellationToken cancellationToken = default)
    {
        var before = _appState.SelectedPoi?.Code;
        var t0 = DateTime.UtcNow.Ticks;
        _telemetry.TryEnqueue(new RuntimeTelemetryEvent(
            RuntimeTelemetryEventKind.MsalApplyInvoked,
            t0,
            detail: $"src={source} byCode={code} before={before}"));

        await _inner.ApplySelectedPoiByCodeAsync(source, code, cancellationToken).ConfigureAwait(false);

        var after = _appState.SelectedPoi?.Code;
        _telemetry.TryEnqueue(new RuntimeTelemetryEvent(
            RuntimeTelemetryEventKind.UiStateCommitted,
            DateTime.UtcNow.Ticks,
            poiCode: after,
            detail: $"src={source} byCode={code} before={before} after={after}"));
    }
}
