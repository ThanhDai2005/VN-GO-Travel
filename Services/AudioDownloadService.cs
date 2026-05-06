using System.Diagnostics;
using CommunityToolkit.Mvvm.Messaging;
using MauiApp1.Messages;
using MauiApp1.Models.Entities;

namespace MauiApp1.Services;

public sealed class AudioDownloadService : IAudioDownloadService
{
    private readonly IZoneAccessRepository _repository;
    private readonly IPoiQueryRepository _poiQuery;
    private readonly ApiService _api;
    private readonly IPreferredLanguageService _languagePrefs;

    public event EventHandler<AudioDownloadProgressEventArgs>? ProgressChanged;

    public AudioDownloadService(
        IZoneAccessRepository repository,
        IPoiQueryRepository poiQuery,
        ApiService api,
        IPreferredLanguageService languagePrefs)
    {
        _repository = repository;
        _poiQuery = poiQuery;
        _api = api;
        _languagePrefs = languagePrefs;
    }

    public async Task DownloadZoneAudioAsync(string zoneCode, CancellationToken ct = default)
    {
        var normalizedZone = zoneCode.Trim().ToUpperInvariant();
        await _repository.InitializeAsync(ct).ConfigureAwait(false);
        await _poiQuery.InitAsync(ct).ConfigureAwait(false);

        var lang = ResolveLanguage();
        var zonePois = (await _poiQuery.GetAllAsync(ct).ConfigureAwait(false))
            .Where(p => string.Equals(p.ZoneCode?.Trim(), normalizedZone, StringComparison.OrdinalIgnoreCase))
            .ToList();

        Emit("DOWNLOAD_STARTED", normalizedZone, 0, zonePois.Count, 0);
        if (zonePois.Count == 0)
        {
            Emit("DOWNLOAD_COMPLETED", normalizedZone, 0, 0, 1);
            return;
        }

        var root = Path.Combine(FileSystem.AppDataDirectory, "audio-packages", normalizedZone, lang);
        Directory.CreateDirectory(root);

        var completed = 0;
        var successCount = 0;
        var failCount = 0;

        foreach (var poi in zonePois)
        {
            ct.ThrowIfCancellationRequested();
            var success = false;
            try
            {
                success = await DownloadPoiAudioAsync(normalizedZone, poi, lang, root, ct).ConfigureAwait(false);
                if (success) successCount++;
                else failCount++;
            }
            catch (Exception ex)
            {
                failCount++;
                Debug.WriteLine($"[AUDIO-DL] POI download failed code={poi.Code}: {ex.Message}");
            }

            completed++;
            Emit("DOWNLOAD_PROGRESS", normalizedZone, completed, zonePois.Count, (double)completed / zonePois.Count);
        }

        if (successCount == 0 && zonePois.Count > 0)
        {
            var error = $"Failed to download any audio files for zone {normalizedZone}. Check server availability.";
            Emit("DOWNLOAD_FAILED", normalizedZone, successCount, zonePois.Count, 0, error);
            throw new InvalidOperationException(error);
        }

        await _repository.SaveDownloadAsync(normalizedZone, true, ct).ConfigureAwait(false);
        Emit("DOWNLOAD_COMPLETED", normalizedZone, completed, zonePois.Count, 1);
    }

    public Task<DownloadedAudio?> GetDownloadedAudioAsync(string poiCode, string lang, CancellationToken ct = default)
        => _repository.GetDownloadedAudioAsync(poiCode, lang, ct);

    public Task<List<DownloadedAudio>> GetAllDownloadedAudioAsync(CancellationToken ct = default)
        => _repository.GetAllDownloadedAudioAsync(ct);

    public async Task<long> GetStorageBytesAsync(CancellationToken ct = default)
    {
        var rows = await _repository.GetAllDownloadedAudioAsync(ct).ConfigureAwait(false);
        long total = 0;
        foreach (var row in rows)
        {
            if (!string.IsNullOrWhiteSpace(row.AudioShortPath) && File.Exists(row.AudioShortPath))
                total += new FileInfo(row.AudioShortPath).Length;
            if (!string.IsNullOrWhiteSpace(row.AudioLongPath) && File.Exists(row.AudioLongPath))
                total += new FileInfo(row.AudioLongPath).Length;
        }
        return total;
    }

    public async Task DeleteZonePackageAsync(string zoneCode, CancellationToken ct = default)
    {
        var normalizedZone = zoneCode.Trim().ToUpperInvariant();
        var rows = await _repository.GetDownloadedAudioByZoneAsync(normalizedZone, ct).ConfigureAwait(false);
        foreach (var row in rows)
        {
            TryDelete(row.AudioShortPath);
            TryDelete(row.AudioLongPath);
        }
        await _repository.DeleteDownloadedAudioByZoneAsync(normalizedZone, ct).ConfigureAwait(false);
        await _repository.SaveDownloadAsync(normalizedZone, false, ct).ConfigureAwait(false);
    }

    private async Task<bool> DownloadPoiAudioAsync(string zoneCode, Models.Poi poi, string lang, string rootDir, CancellationToken ct)
    {
        var code = poi.Code.Trim().ToUpperInvariant();
        var poiDir = Path.Combine(rootDir, code);
        Directory.CreateDirectory(poiDir);

        var shortPath = Path.Combine(poiDir, "short.mp3");
        var longPath = Path.Combine(poiDir, "long.mp3");
        var hasShort = await TryDownloadToFileAsync(BuildCandidates(code, lang, true), shortPath, ct).ConfigureAwait(false);
        var hasLong = await TryDownloadToFileAsync(BuildCandidates(code, lang, false), longPath, ct).ConfigureAwait(false);

        var sourceType = (hasShort || hasLong) ? "manual" : "tts";
        if (!hasShort) shortPath = string.Empty;
        if (!hasLong) longPath = string.Empty;

        var row = new DownloadedAudio
        {
            Id = $"{zoneCode}_{code}_{lang}",
            ZoneId = zoneCode,
            PoiCode = code,
            Lang = lang,
            AudioShortPath = shortPath,
            AudioLongPath = longPath,
            SourceType = sourceType,
            DownloadedAt = DateTime.UtcNow.ToString("O")
        };

        await _repository.UpsertDownloadedAudioAsync(row, ct).ConfigureAwait(false);
        return hasShort || hasLong;
    }

    private static List<string> BuildCandidates(string poiCode, string lang, bool isShort)
    {
        var kind = isShort ? "short" : "long";
        return
        [
            $"audio/{lang}/{poiCode}_{kind}.mp3",
            $"audio/{lang}/{poiCode}.mp3",
            $"audio/en/{poiCode}_{kind}.mp3",
            $"audio/en/{poiCode}.mp3",
            $"audio/vi/{poiCode}_{kind}.mp3",
            $"audio/vi/{poiCode}.mp3",
            $"audio/{poiCode}.mp3"
        ];
    }

    private async Task<bool> TryDownloadToFileAsync(List<string> relativeUrls, string outputPath, CancellationToken ct)
    {
        foreach (var relative in relativeUrls)
        {
            try
            {
                using var response = await _api.GetAsync(relative, ct).ConfigureAwait(false);
                if (!response.IsSuccessStatusCode)
                    continue;

                var bytes = await response.Content.ReadAsByteArrayAsync(ct).ConfigureAwait(false);
                if (bytes.Length == 0) continue;
                await File.WriteAllBytesAsync(outputPath, bytes, ct).ConfigureAwait(false);
                return true;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[AUDIO-DL] Candidate {relative} failed: {ex.Message}");
            }
        }
        return false;
    }

    private string ResolveLanguage()
    {
        var preferred = _languagePrefs.GetStoredOrDefault().Trim().ToLowerInvariant();
        return string.IsNullOrWhiteSpace(preferred) ? "en" : preferred;
    }

    private void Emit(string eventType, string zoneCode, int completed, int total, double progress, string? error = null)
    {
        var payload = new AudioDownloadProgressEventArgs
        {
            EventType = eventType,
            ZoneCode = zoneCode,
            CompletedPois = completed,
            TotalPois = total,
            Progress = progress,
            Error = error
        };
        ProgressChanged?.Invoke(this, payload);
        WeakReferenceMessenger.Default.Send(new AudioDownloadProgressMessage(eventType, zoneCode, completed, total, progress, error));
    }

    private static void TryDelete(string path)
    {
        if (!string.IsNullOrWhiteSpace(path) && File.Exists(path))
            File.Delete(path);
    }
}
