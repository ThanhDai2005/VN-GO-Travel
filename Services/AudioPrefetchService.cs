using System.Diagnostics;
using MauiApp1.Configuration;
using MauiApp1.Models;
using Microsoft.Maui.Networking;

namespace MauiApp1.Services;

public class AudioPrefetchService
{
    private readonly HttpClient _httpClient;
    private readonly IZoneAccessService _zoneAccess;
    private readonly Uri _audioBase;
    private readonly SemaphoreSlim _downloadGate = new(3, 3);

    public AudioPrefetchService(IZoneAccessService zoneAccess)
    {
        _zoneAccess = zoneAccess;
        _httpClient = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(30)
        };

        _audioBase = new Uri(new Uri(BackendApiConfiguration.BaseUrl), "/");
    }

    private static readonly char[] InvalidFileChars = Path.GetInvalidFileNameChars();

    public async Task PrefetchZoneAudioAsync(string zoneCode, IEnumerable<ZonePoiData> pois, CancellationToken cancellationToken = default)
    {
        if (pois == null) return;
        
        try
        {
            // --- MANDATORY SECURITY LOCKDOWN (TASK 1, 3, 5) ---
            await _zoneAccess.EnsureAccessAsync(zoneCode).ConfigureAwait(false);
        }
        catch (UnauthorizedAccessException)
        {
            Debug.WriteLine($"[SECURITY] BLOCKED PrefetchZoneAudioAsync for Zone {zoneCode} - Unauthorized");
            return;
        }

        if (!IsWifiOnline()) return;

        var audioDir = Path.Combine(FileSystem.AppDataDirectory, "audio");
        Directory.CreateDirectory(audioDir);

        var tasks = new List<Task>();

        foreach (var poi in pois)
        {
            if (string.IsNullOrWhiteSpace(poi?.Code)) continue;

            var audioUrl = ResolveAudioUrl(poi);
            if (string.IsNullOrWhiteSpace(audioUrl)) continue;

            var safeName = ToSafeFileName(poi.Code.Trim().ToUpperInvariant());
            var filePath = Path.Combine(audioDir, $"{safeName}.mp3");

            if (File.Exists(filePath))
            {
                Debug.WriteLine($"[AUDIO-PREFETCH] Skip existing audio for {poi.Code}");
                continue;
            }

            tasks.Add(DownloadAudioAsync(audioUrl, filePath, poi.Code, cancellationToken));
        }

        if (tasks.Count == 0) return;

        try
        {
            await Task.WhenAll(tasks).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[AUDIO-PREFETCH] Prefetch error: {ex.Message}");
        }
    }

    private async Task DownloadAudioAsync(string url, string filePath, string poiCode, CancellationToken cancellationToken)
    {
        await _downloadGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var uri = ResolveAudioUri(url);
            if (uri == null) return;

            using var response = await _httpClient.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                Debug.WriteLine($"[AUDIO-PREFETCH] Download failed for {poiCode}: HTTP {(int)response.StatusCode}");
                return;
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
            await using var fs = File.Open(filePath, FileMode.Create, FileAccess.Write, FileShare.None);
            await stream.CopyToAsync(fs, cancellationToken).ConfigureAwait(false);

            Debug.WriteLine($"[AUDIO-PREFETCH] Cached audio for {poiCode} at {filePath}");
        }
        catch (OperationCanceledException)
        {
            Debug.WriteLine($"[AUDIO-PREFETCH] Cancelled download for {poiCode}");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[AUDIO-PREFETCH] Error downloading {poiCode}: {ex.Message}");
        }
        finally
        {
            _downloadGate.Release();
        }
    }

    private static bool IsWifiOnline()
    {
        try
        {
            if (Connectivity.Current.NetworkAccess != NetworkAccess.Internet)
                return false;

            var profiles = Connectivity.Current.ConnectionProfiles;
            return profiles.Contains(ConnectionProfile.WiFi) || profiles.Contains(ConnectionProfile.Ethernet);
        }
        catch
        {
            return false;
        }
    }

    private static string? ResolveAudioUrl(ZonePoiData poi)
    {
        if (poi.Audio is { Ready: true } && !string.IsNullOrWhiteSpace(poi.Audio.Url))
            return poi.Audio.Url;

        if (!string.IsNullOrWhiteSpace(poi.AudioUrl))
            return poi.AudioUrl;

        return null;
    }

    private Uri? ResolveAudioUri(string url)
    {
        if (Uri.TryCreate(url, UriKind.Absolute, out var absolute))
            return absolute;

        if (string.IsNullOrWhiteSpace(url)) return null;
        if (!url.StartsWith('/')) url = "/" + url;

        return new Uri(_audioBase, url);
    }

    private static string ToSafeFileName(string code)
    {
        var buffer = code.ToCharArray();
        for (var i = 0; i < buffer.Length; i++)
        {
            if (InvalidFileChars.Contains(buffer[i]))
                buffer[i] = '_';
        }

        return new string(buffer);
    }
}
