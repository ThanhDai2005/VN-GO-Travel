using MauiApp1.Models.Entities;

namespace MauiApp1.Services;

public interface IAudioDownloadService
{
    event EventHandler<AudioDownloadProgressEventArgs>? ProgressChanged;

    Task DownloadZoneAudioAsync(string zoneCode, CancellationToken ct = default);
    Task<DownloadedAudio?> GetDownloadedAudioAsync(string poiCode, string lang, CancellationToken ct = default);
    Task<List<DownloadedAudio>> GetAllDownloadedAudioAsync(CancellationToken ct = default);
    Task<long> GetStorageBytesAsync(CancellationToken ct = default);
    Task DeleteZonePackageAsync(string zoneCode, CancellationToken ct = default);
}

public sealed class AudioDownloadProgressEventArgs : EventArgs
{
    public string EventType { get; init; } = "DOWNLOAD_PROGRESS";
    public string ZoneCode { get; init; } = string.Empty;
    public int CompletedPois { get; init; }
    public int TotalPois { get; init; }
    public double Progress { get; init; }
    public string? Error { get; init; }
}
