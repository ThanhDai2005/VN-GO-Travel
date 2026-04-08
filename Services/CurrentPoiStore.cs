using System;

namespace MauiApp1.Services;

/// <summary>
/// Lightweight app-wide store for the currently active/selected POI code.
/// Used to keep Map and Detail views in sync without duplicating state.
/// </summary>
public class CurrentPoiStore
{
    private readonly object _lock = new();
    private string? _code;
    private string? _lang;

    public event Action<string?, string?>? CurrentPoiChanged;

    public void SetCurrentPoi(string? code, string? lang = null)
    {
        lock (_lock)
        {
            _code = string.IsNullOrWhiteSpace(code) ? null : code.Trim().ToUpperInvariant();
            _lang = string.IsNullOrWhiteSpace(lang) ? null : lang.Trim().ToLowerInvariant();
        }

        try
        {
            CurrentPoiChanged?.Invoke(_code, _lang);
        }
        catch { }
    }

    public (string? code, string? lang) GetCurrentPoi()
    {
        lock (_lock)
        {
            return (_code, _lang);
        }
    }

    public void Clear()
    {
        SetCurrentPoi(null, null);
    }
}
