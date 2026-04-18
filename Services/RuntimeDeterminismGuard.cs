using System.ComponentModel;
using System.Diagnostics;
using Microsoft.Extensions.Logging;
using Microsoft.Maui.ApplicationModel;

namespace MauiApp1.Services;

/// <summary>
/// Runtime Determinism Guard Layer (RDGL) — v7.2.5.
/// DEBUG observability: verifies thread affinity for properties that must only change on the main thread
/// under the GAK + MSAL model. Release builds use a no-op constructor.
/// </summary>
public sealed class RuntimeDeterminismGuard
{
#if DEBUG
    public RuntimeDeterminismGuard(AppState appState, ILogger<RuntimeDeterminismGuard>? logger = null)
    {
        appState.PropertyChanged += (_, e) =>
        {
            if (e.PropertyName != nameof(AppState.SelectedPoi) && e.PropertyName != nameof(AppState.CurrentLocation))
                return;

            if (MainThread.IsMainThread)
                return;

            var msg = $"[RDGL] Invariant: '{e.PropertyName}' changed off the main UI thread (GAK/MSAL thread contract).";
            logger?.LogWarning(msg);
            Debug.WriteLine(msg);
        };
    }
#else
    public RuntimeDeterminismGuard(AppState appState, ILogger<RuntimeDeterminismGuard>? logger = null)
    {
    }
#endif
}
