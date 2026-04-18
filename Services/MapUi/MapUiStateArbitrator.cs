using System.Diagnostics;
using MauiApp1.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Maui.ApplicationModel;

namespace MauiApp1.Services.MapUi;

/// <summary>
/// Serializes UI selection commits on the main thread, dedupes rapid duplicates, and prevents low-priority
/// auto-proximity from stomping explicit user / QR intent within a short window — without changing navigation,
/// geofence math, QR parsing, or TTS content.
/// </summary>
public sealed class MapUiStateArbitrator : IMapUiStateArbitrator
{
    private const int DedupeWindowMs = 120;
    private static readonly TimeSpan UserIntentHoldDuration = TimeSpan.FromSeconds(3);

    private readonly IServiceProvider _services;
    private readonly ILogger<MapUiStateArbitrator>? _logger;

    /// <summary>Held only while executing on the main thread (never across a cross-thread wait).</summary>
    private readonly SemaphoreSlim _mainThreadGate = new(1, 1);

    private DateTime _lastCommitUtc = DateTime.MinValue;
    private string _lastCommittedCode = "";
    private int _lastCommittedSourcePriority;
    private DateTime _userIntentHoldUntilUtc = DateTime.MinValue;

    public MapUiStateArbitrator(IServiceProvider services, ILogger<MapUiStateArbitrator>? logger = null)
    {
        _services = services;
        _logger = logger;
    }

    private AppState App => _services.GetRequiredService<AppState>();

    private static bool ExtendsUserIntentHold(MapUiSelectionSource source)
        => (int)source >= (int)MapUiSelectionSource.ManualMapPinTap;

    public Task ApplySelectedPoiAsync(MapUiSelectionSource source, Poi? poi, CancellationToken cancellationToken = default)
    {
        async Task Work()
        {
            await _mainThreadGate.WaitAsync(cancellationToken).ConfigureAwait(true);
            try
            {
                ApplyCoreSync(source, poi, cancellationToken);
            }
            finally
            {
                _mainThreadGate.Release();
            }
        }

        if (MainThread.IsMainThread)
            return Work();

        return MainThread.InvokeOnMainThreadAsync(Work);
    }

    public async Task ApplySelectedPoiByCodeAsync(MapUiSelectionSource source, string? code, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            await ApplySelectedPoiAsync(source, null, cancellationToken).ConfigureAwait(false);
            return;
        }

        var normalized = code.Trim().ToUpperInvariant();
        Poi? match;

        if (MainThread.IsMainThread)
            match = App.Pois.FirstOrDefault(p => p.Code == normalized);
        else
        {
            match = null;
            await MainThread.InvokeOnMainThreadAsync(() =>
            {
                match = App.Pois.FirstOrDefault(p => p.Code == normalized);
            }).ConfigureAwait(false);
        }

        if (match == null)
        {
            Debug.WriteLine($"[MSAL] ApplySelectedPoiByCodeAsync: no in-memory match for code={normalized} — no-op (legacy parity)");
            return;
        }

        await ApplySelectedPoiAsync(source, match, cancellationToken).ConfigureAwait(false);
    }

    private void ApplyCoreSync(MapUiSelectionSource source, Poi? poi, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var current = App.SelectedPoi;
        var incomingCode = poi?.Code?.Trim().ToUpperInvariant() ?? "";
        var currentCode = current?.Code?.Trim().ToUpperInvariant() ?? "";

        if (ShouldSuppress(source, poi, current, incomingCode, currentCode, out var reason))
        {
            if (MapUiArbitrationModes.ShadowLogOnlySuppressions)
            {
                LogShadow(reason, source, incomingCode);
            }
            else if (!MapUiArbitrationModes.DisableArbitrationRules)
            {
                Debug.WriteLine($"[MSAL] Suppressed ({reason}) source={source} code={incomingCode}");
                _logger?.LogDebug("[MSAL] Suppressed {Reason} source={Source} code={Code}", reason, source, incomingCode);
                return;
            }
        }

        if (ReferenceEquals(current, poi) && incomingCode == currentCode)
            return;

        App.CommitSelectedPoiForUi(poi);

        var utc = DateTime.UtcNow;
        _lastCommitUtc = utc;
        _lastCommittedCode = incomingCode;
        _lastCommittedSourcePriority = (int)source;

        if (ExtendsUserIntentHold(source) && poi != null)
            _userIntentHoldUntilUtc = utc + UserIntentHoldDuration;
    }

    private void LogShadow(string reason, MapUiSelectionSource source, string incomingCode)
    {
        var msg = $"[MSAL-SHADOW] Would suppress ({reason}) source={source} code={incomingCode} — applying anyway (Phase 1)";
        Debug.WriteLine(msg);
        _logger?.LogWarning(msg);
    }

    private bool ShouldSuppress(
        MapUiSelectionSource source,
        Poi? incoming,
        Poi? current,
        string incomingCode,
        string currentCode,
        out string reason)
    {
        reason = "";
        if (MapUiArbitrationModes.DisableArbitrationRules)
            return false;

        if (incomingCode == currentCode)
        {
            if (incoming != null && current != null && ReferenceEquals(incoming, current))
            {
                reason = "identical-reference";
                return true;
            }

            return false;
        }

        if (source == MapUiSelectionSource.MapAutoProximity
            && incoming != null
            && DateTime.UtcNow < _userIntentHoldUntilUtc
            && current != null
            && !string.IsNullOrEmpty(currentCode))
        {
            reason = "user-intent-hold";
            return true;
        }

        var sinceMs = (DateTime.UtcNow - _lastCommitUtc).TotalMilliseconds;
        if (sinceMs >= 0
            && sinceMs < DedupeWindowMs
            && source != MapUiSelectionSource.NarrationSync
            && incomingCode == _lastCommittedCode
            && (int)source <= _lastCommittedSourcePriority)
        {
            reason = "dedupe-window";
            return true;
        }

        return false;
    }
}
