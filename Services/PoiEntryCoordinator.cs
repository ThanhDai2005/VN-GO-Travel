using System;
using System.Threading.Tasks;
using MauiApp1.Models;
using Microsoft.Maui.Controls;
using Microsoft.Maui.ApplicationModel;
using System.Diagnostics;

namespace MauiApp1.Services;

public class PoiEntryResult
{
    public bool Success { get; set; }
    public string? Error { get; set; }

    /// <summary>False when <see cref="Success"/> is true but navigation was intentionally skipped (e.g. duplicate guard).</summary>
    public bool Navigated { get; set; } = true;
}

public class PoiEntryCoordinator
{
    private readonly PoiDatabase          _db;
    private readonly LocalizationService   _locService;
    private readonly ViewModels.MapViewModel _mapVm;
    private bool     _isHandling;
    private string?  _lastHandledCode;
    private DateTime _lastHandledAt = DateTime.MinValue;

    private readonly CurrentPoiStore _currentPoiStore;

    public PoiEntryCoordinator(
        PoiDatabase db,
        LocalizationService locService,
        ViewModels.MapViewModel mapVm,
        CurrentPoiStore currentPoiStore)
    {
        _db              = db;
        _locService      = locService;
        _mapVm           = mapVm;
        _currentPoiStore = currentPoiStore;
    }

    public async Task<PoiEntryResult> HandleEntryAsync(PoiEntryRequest request)
    {
        if (request == null) return new PoiEntryResult { Success = false, Error = "Request is null" };

        if (_isHandling)
            return new PoiEntryResult { Success = false, Error = "Busy" };

        _isHandling = true;
        try
        {
            var raw = request.RawInput;
            Debug.WriteLine($"[QR-NAV] PoiEntryCoordinator.HandleEntryAsync start source={request.Source} rawLen={raw?.Length ?? 0}");

            var parsed = QrResolver.Parse(raw);
            if (!parsed.Success)
                return new PoiEntryResult { Success = false, Error = parsed.Error ?? "Invalid QR" };

            var code = parsed.Code!;

            // Update shared current POI state early so Map and other listeners can react.
            try
            {
                _currentPoiStore?.SetCurrentPoi(code, request.PreferredLanguage);
                Debug.WriteLine($"[QR-NAV] PoiEntryCoordinator set current POI code={code} lang={request.PreferredLanguage}");
            }
            catch { }

            // Avoid immediate duplicate navigation for the same code within a short cooldown window.
            // This is a lightweight guard against accidental double-trigger (e.g., rapid scans/taps).
            try
            {
                if (!string.IsNullOrEmpty(_lastHandledCode) && string.Equals(_lastHandledCode, code, StringComparison.OrdinalIgnoreCase))
                {
                    var since = (DateTime.UtcNow - _lastHandledAt).TotalMilliseconds;
                    if (since >= 0 && since < 2000)
                    {
                        Debug.WriteLine($"[QR-NAV] Duplicate handle suppressed for code='{code}' since={since}ms");
                        return new PoiEntryResult { Success = true, Navigated = false };
                    }
                }
            }
            catch { }

            await _db.InitAsync();

            Debug.WriteLine($"[QR-NAV] PoiEntryCoordinator parsed code={code}");

            // Use the current MapViewModel language (always valid, never empty) — BUG-5 fix.
            // Do NOT use poi.LanguageCode: after the DB refactor GetOrTranslateAsync returns a
            // core Poi with Localization=null, making LanguageCode an empty string.
            var preferred = !string.IsNullOrWhiteSpace(request.PreferredLanguage)
                ? request.PreferredLanguage
                : _mapVm.CurrentLanguage;

            // Verify POI exists without calling PoiTranslationService (which is broken).
            var core = await _db.GetByCodeAsync(code).ConfigureAwait(false);
            if (core == null)
                return new PoiEntryResult { Success = false, Error = "POI not found in database" };

            Debug.WriteLine($"[QR-NAV] POI found: code={code} preferred_lang={preferred}");

            string route;
            if (request.NavigationMode == PoiNavigationMode.Map)
            {
                var qs = $"code={Uri.EscapeDataString(code)}&lang={Uri.EscapeDataString(preferred)}";
                if (request.Source == PoiEntrySource.Scanner)
                    qs += "&narrate=1";
                route = $"//map?{qs}";
            }
            else
            {
                route = $"/poidetail?code={Uri.EscapeDataString(code)}&lang={Uri.EscapeDataString(preferred)}";
            }

            Debug.WriteLine(
                $"[QR-NAV] PoiEntryCoordinator navigating mode={request.NavigationMode} route={route}");
            if (request.Source == PoiEntrySource.FutureDeepLink
                && request.NavigationMode == PoiNavigationMode.Detail)
            {
                Debug.WriteLine("[DL-NAV] Navigation to PoiDetail started");
            }

            await MainThread.InvokeOnMainThreadAsync(async () =>
            {
                await Shell.Current.GoToAsync(route);
            });

            if (request.Source == PoiEntrySource.FutureDeepLink
                && request.NavigationMode == PoiNavigationMode.Detail)
            {
                Debug.WriteLine("[DL-NAV] Navigation completed");
            }

            // record last handled code/time for duplicate suppression
            try
            {
                _lastHandledCode = code;
                _lastHandledAt = DateTime.UtcNow;
            }
            catch { }

            Debug.WriteLine($"[QR-NAV] PoiEntryCoordinator completed for code={code}");

            return new PoiEntryResult { Success = true, Navigated = true };
        }
        catch (Exception ex)
        {
            return new PoiEntryResult { Success = false, Error = ex.Message };
        }
        finally
        {
            _isHandling = false;
        }
    }
}
