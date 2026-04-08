using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace MauiApp1.Models;

/// <summary>Download state of a language pack.</summary>
public enum DownloadState
{
    /// <summary>Not yet downloaded — requires a download step before use.</summary>
    NotDownloaded,
    /// <summary>Download in progress — ignore new requests.</summary>
    Downloading,
    /// <summary>Downloaded and available for use.</summary>
    Downloaded,
    /// <summary>Last download attempt failed — retryable.</summary>
    Failed
}

/// <summary>
/// Represents a single supported language with its download state.
/// Observable so CollectionView items update automatically (✅/⬇️/⏳).
/// </summary>
public class LanguagePack : INotifyPropertyChanged
{
    public string Code        { get; init; } = "";
    public string DisplayName { get; init; } = "";
    public string NativeName  { get; init; } = "";

    /// <summary>Estimated content size label shown to user before download.</summary>
    public string SizeLabel   { get; init; } = "";

    private DownloadState _state;
    public DownloadState State
    {
        get => _state;
        set
        {
            if (_state == value) return;
            _state = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(StatusIcon));
            OnPropertyChanged(nameof(IsAvailable));
            OnPropertyChanged(nameof(IsDownloading));
            OnPropertyChanged(nameof(IsNotDownloaded));
            OnPropertyChanged(nameof(IsFailed));
            OnPropertyChanged(nameof(CanSelect));
        }
    }

    // ── UI helpers ──────────────────────────────────────────────────────────

    public string StatusIcon => State switch
    {
        DownloadState.Downloaded  => "✅",
        DownloadState.Downloading => "⏳",
        DownloadState.Failed      => "❌",
        _                         => "⬇️"
    };

    /// <summary>True when this pack can be used immediately (already downloaded).</summary>
    public bool IsAvailable     => State == DownloadState.Downloaded;
    public bool IsDownloading   => State == DownloadState.Downloading;
    public bool IsNotDownloaded => State == DownloadState.NotDownloaded;
    public bool IsFailed        => State == DownloadState.Failed;

    /// <summary>User can tap to select only when downloaded or failed (not mid-download).</summary>
    public bool CanSelect       => State != DownloadState.Downloading;

    // ── INotifyPropertyChanged ───────────────────────────────────────────────

    public event PropertyChangedEventHandler? PropertyChanged;
    private void OnPropertyChanged([CallerMemberName] string name = "")
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
