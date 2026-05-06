using System.Diagnostics;
using CommunityToolkit.Mvvm.Messaging;
using MauiApp1.Messages;

namespace MauiApp1.Services;

public sealed class BackgroundConsistencyService
{
    private readonly IZoneAccessService _zoneAccess;
    private readonly IAccessStateCoordinator _accessCoordinator;
    private readonly AppState _appState;
    private readonly SemaphoreSlim _syncLock = new(1, 1);

    public BackgroundConsistencyService(
        IZoneAccessService zoneAccess,
        IAccessStateCoordinator accessCoordinator,
        AppState appState)
    {
        _zoneAccess = zoneAccess;
        _accessCoordinator = accessCoordinator;
        _appState = appState;
    }

    public async Task TriggerFullReconciliationAsync(string reason = "Unknown")
    {
        if (!await _syncLock.WaitAsync(0)) return;

        try
        {
            Debug.WriteLine($"[CONSISTENCY] Starting reconciliation. Reason: {reason}");
            
            // 1. Sync purchases with server
            await _zoneAccess.SyncAsync().ConfigureAwait(false);
            
            // 2. Re-evaluate active POI if open
            var activeCode = _appState.ActiveNarrationCode;
            if (!string.IsNullOrEmpty(activeCode))
            {
                await _accessCoordinator.InvalidateAndRefreshAsync(activeCode).ConfigureAwait(false);
            }

            Debug.WriteLine($"[CONSISTENCY] Reconciliation completed for {reason}");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[CONSISTENCY] Error: {ex.Message}");
        }
        finally
        {
            _syncLock.Release();
        }
    }
}
