using MauiApp1.Models;

namespace MauiApp1.Services.MapUi;

/// <summary>
/// Map State Arbitration Layer (MSAL): single ingestion path for <see cref="AppState.SelectedPoi"/> changes.
/// </summary>
public interface IMapUiStateArbitrator
{
    /// <summary>
    /// Applies selection after arbitration. Safe from any thread; marshals to the main thread internally.
    /// </summary>
    Task ApplySelectedPoiAsync(MapUiSelectionSource source, Poi? poi, CancellationToken cancellationToken = default);

    /// <summary>
    /// Resolves <paramref name="code"/> against <see cref="AppState.Pois"/> on the main thread, then applies.
    /// If no match exists, the current selection is left unchanged (legacy <c>SetSelectedPoiByCode</c> behavior).
    /// </summary>
    Task ApplySelectedPoiByCodeAsync(MapUiSelectionSource source, string? code, CancellationToken cancellationToken = default);
}
