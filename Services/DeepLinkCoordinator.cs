using System.Diagnostics;
using System.Threading;
using MauiApp1.Models;
using Microsoft.Maui.ApplicationModel;
using Microsoft.Maui.Controls;

namespace MauiApp1.Services;

/// <summary>
/// Bridges Android VIEW intents to <see cref="DeepLinkHandler"/> on the MAUI main thread
/// when Shell navigation is safe. Warm/background links are queued via <see cref="PendingDeepLinkStore"/>.
/// </summary>
public sealed class DeepLinkCoordinator
{
    private readonly PendingDeepLinkStore _store;
    private readonly DeepLinkHandler _handler;
    private readonly SemaphoreSlim _dispatchGate = new(1, 1);
    private CancellationTokenSource? _dispatchCts;
    private int _dispatchVersion;

    public DeepLinkCoordinator(PendingDeepLinkStore store, DeepLinkHandler handler)
    {
        _store = store;
        _handler = handler;
    }

    /// <summary>Called from Android MainActivity after storing the pending URI.</summary>
    public void OnAndroidViewIntent(string rawUri, string androidSource, bool isWarm)
    {
        Debug.WriteLine($"[DL-DISPATCH] Received uri={rawUri} source={androidSource} isWarm={isWarm}");

        if (!isWarm)
        {
            Debug.WriteLine("[DL-DISPATCH] Cold / OnCreate link stored only (E1 deferred), no auto-dispatch");
            return;
        }

        lock (this)
        {
            _dispatchVersion++;
            _dispatchCts?.Cancel();
            _dispatchCts?.Dispose();
            _dispatchCts = new CancellationTokenSource();
            var token = _dispatchCts.Token;
            var version = _dispatchVersion;
            _ = RunWarmDispatchAsync(version, token);
        }
    }

    /// <summary>Retry consumption after resume if a warm link is still pending.</summary>
    public void OnAppResumed()
    {
        if (!_store.HasWarmPendingLink())
        {
            Debug.WriteLine("[DL-DISPATCH] OnAppResumed: no warm pending");
            return;
        }

        Debug.WriteLine("[DL-DISPATCH] OnAppResumed: warm pending exists, scheduling dispatch");
        lock (this)
        {
            _dispatchVersion++;
            _dispatchCts?.Cancel();
            _dispatchCts?.Dispose();
            _dispatchCts = new CancellationTokenSource();
            var token = _dispatchCts.Token;
            var version = _dispatchVersion;
            _ = RunWarmDispatchAsync(version, token);
        }
    }

    /// <summary>Optional: Shell finished first layout; helps if intent arrived before Shell was ready.</summary>
    public void OnShellAppeared()
    {
        if (!_store.HasWarmPendingLink())
            return;

        Debug.WriteLine("[DL-DISPATCH] OnShellAppeared: warm pending, scheduling dispatch");
        OnAppResumed();
    }

    private async Task RunWarmDispatchAsync(int version, CancellationToken ct)
    {
        var entered = false;
        try
        {
            await _dispatchGate.WaitAsync(ct).ConfigureAwait(false);
            entered = true;

            if (version != Volatile.Read(ref _dispatchVersion))
            {
                Debug.WriteLine("[DL-DISPATCH] Dispatch superseded by newer intent, stopping");
                return;
            }

            const int maxAttempts = 20;
            for (var attempt = 0; attempt < maxAttempts && !ct.IsCancellationRequested; attempt++)
            {
                if (version != Volatile.Read(ref _dispatchVersion))
                    return;

                var delayMs = attempt == 0 ? 120 : 220;
                await Task.Delay(delayMs, ct).ConfigureAwait(false);

                var ready = await MainThread.InvokeOnMainThreadAsync(IsShellNavigationReady).ConfigureAwait(false);
                if (!ready)
                {
                    Debug.WriteLine($"[DL-DISPATCH] Shell not ready, keeping pending URI (attempt {attempt + 1}/{maxAttempts})");
                    continue;
                }

                var raw = _store.TakePendingLinkIfWarm();

                if (string.IsNullOrWhiteSpace(raw))
                {
                    Debug.WriteLine("[DL-DISPATCH] No warm pending after take (empty or cold-only)");
                    return;
                }

                Debug.WriteLine($"[DL-DISPATCH] Consuming pending URI={raw}");

                DeepLinkHandleResult result;
                try
                {
                    result = await _handler.HandleIncomingLinkAsync(raw).ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[DL-ERR] HandleIncomingLinkAsync: {ex}");
                    return;
                }

                if (result.Success)
                    Debug.WriteLine($"[DL-NAV] Navigation pipeline completed success for uri={raw}");
                else
                    Debug.WriteLine($"[DL-NAV] Navigation skipped or failed: {result.Error} uri={raw}");

                return;
            }

            Debug.WriteLine("[DL-DISPATCH] Exhausted retries; warm URI still pending in store (if not superseded)");
        }
        catch (OperationCanceledException)
        {
            Debug.WriteLine("[DL-DISPATCH] Dispatch cancelled (superseded)");
        }
        finally
        {
            if (entered)
                _dispatchGate.Release();
        }
    }

    private static bool IsShellNavigationReady()
    {
        try
        {
            if (Shell.Current is null)
            {
                Debug.WriteLine("[DL-DISPATCH] Shell.Current is null");
                return false;
            }

            if (Application.Current?.Windows is null || Application.Current.Windows.Count == 0)
            {
                Debug.WriteLine("[DL-DISPATCH] No application windows yet");
                return false;
            }

            if (Shell.Current.CurrentPage is null)
            {
                Debug.WriteLine("[DL-DISPATCH] Shell.CurrentPage is null");
                return false;
            }

            return true;
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[DL-ERR] IsShellNavigationReady: {ex}");
            return false;
        }
    }
}
