using System.Diagnostics;
using MauiApp1.ApplicationContracts.Services;
using MauiApp1.Services.Observability;
using Microsoft.Maui.Media;

namespace MauiApp1.Services;

public sealed class AudioPlayerService : IAudioPlayerService
{
    private readonly IZoneAccessService _zoneAccess;
    private readonly ILoggerService _logger;
    private readonly IZoneDownloadService _downloadService;
    private CancellationTokenSource? _ttsCts;

    public bool IsPlaying { get; private set; }
    public bool IsBuffering { get; private set; }
    public TimeSpan CurrentPosition => TimeSpan.Zero; // Placeholder for platform impl
    public TimeSpan Duration => TimeSpan.Zero;        // Placeholder for platform impl

    private string? _currentZoneId;
    private string? _currentAudioUrl;

    public AudioPlayerService(
        IZoneAccessService zoneAccess, 
        ILoggerService logger,
        IZoneDownloadService downloadService)
    {
        _zoneAccess = zoneAccess;
        _logger = logger;
        _downloadService = downloadService;

        // STEP 3: ACCESS REVOKED HOOK
        _zoneAccess.AccessRevoked += (s, revokedZoneId) =>
        {
            if (_currentZoneId == revokedZoneId)
            {
                _logger.LogWarning("ACCESS_REVOKED_STOP", new { zoneId = revokedZoneId });
                _ = StopAsync();
            }
        };
    }

    // ── Legacy TTS Support ──
    public async Task SpeakAsync(string poiCode, string text, string languageCode, CancellationToken ct = default)
    {
        _ttsCts?.Cancel();
        _ttsCts = CancellationTokenSource.CreateLinkedTokenSource(ct);

        try
        {
            var locales = await TextToSpeech.Default.GetLocalesAsync().ConfigureAwait(false);
            var locale = locales.FirstOrDefault(l => l.Language.StartsWith(languageCode, StringComparison.OrdinalIgnoreCase));
            
            var options = new SpeechOptions
            {
                Locale = locale,
                Pitch = 1.0f,
                Volume = 1.0f
            };

            await TextToSpeech.Default.SpeakAsync(text, options, cancelToken: _ttsCts.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            _logger.LogError("TTS_FAILED", ex, new { poiCode, languageCode });
        }
    }

    // ── Production MP3 Support (STEP 1 & 2) ──
    public async Task PlayAsync(string audioUrl, string zoneId, CancellationToken ct = default)
    {
        _currentZoneId = zoneId;
        _currentAudioUrl = audioUrl;

        // 🔴 CORE RULE: NO ACCESS -> NO AUDIO
        await _zoneAccess.EnsureAccessAsync(zoneId, ct).ConfigureAwait(false);

        // STEP 1: FILE INTEGRITY & RESOLUTION
        var localSource = await GetPlayableLocalSource(zoneId, audioUrl).ConfigureAwait(false);
        var playSource = localSource ?? audioUrl;
        var isLocal = localSource != null;

        _logger.LogInfo("AUDIO_PLAY_REQUEST", new 
        { 
            zoneId, 
            source = isLocal ? "LOCAL" : "REMOTE",
            path = playSource
        });

        try
        {
            await ExecutePlaybackAsync(playSource).ConfigureAwait(false);
            _logger.LogInfo("AUDIO_PLAY_SUCCESS", new { zoneId, source = isLocal ? "LOCAL" : "REMOTE" });
        }
        catch (Exception ex)
        {
            // STEP 2: FALLBACK (If local failed, try remote)
            if (isLocal)
            {
                _logger.LogWarning("AUDIO_LOCAL_FAILED_FALLBACK", new { zoneId, error = ex.Message });
                try
                {
                    await ExecutePlaybackAsync(audioUrl).ConfigureAwait(false);
                    _logger.LogInfo("AUDIO_PLAY_SUCCESS", new { zoneId, source = "REMOTE_FALLBACK" });
                    return;
                }
                catch (Exception ex2)
                {
                    _logger.LogError("AUDIO_PLAY_FAILED", ex2, new { zoneId, reason = "Remote fallback failed" });
                    throw;
                }
            }

            _logger.LogError("AUDIO_PLAY_FAILED", ex, new { zoneId, reason = "Direct remote failed" });
            throw;
        }
    }

    private async Task ExecutePlaybackAsync(string source)
    {
        IsBuffering = !source.StartsWith(FileSystem.AppDataDirectory);
        
        // Simulating platform playback
        await Task.Delay(100); 
        
        IsPlaying = true;
        IsBuffering = false;
    }

    public void Pause() 
    {
        IsPlaying = false;
        _logger.LogInfo("AUDIO_PAUSE");
    }

    public void Resume() 
    {
        IsPlaying = true;
        _logger.LogInfo("AUDIO_RESUME");
    }

    public async Task StopAsync(CancellationToken ct = default)
    {
        IsPlaying = false;
        _currentZoneId = null;
        _currentAudioUrl = null;
        _ttsCts?.Cancel();
        _logger.LogInfo("AUDIO_STOP");
        await Task.CompletedTask;
    }

    public void Seek(TimeSpan position)
    {
        _logger.LogInfo("AUDIO_SEEK", new { position });
    }

    private async Task<string?> GetPlayableLocalSource(string zoneId, string audioUrl)
    {
        // STEP 1: FILE INTEGRITY CHECK
        var fileName = Path.GetFileName(audioUrl);
        var localPath = Path.Combine(FileSystem.AppDataDirectory, "zones", zoneId, fileName);

        if (File.Exists(localPath))
        {
            var info = new FileInfo(localPath);
            if (info.Length > 0)
            {
                return localPath;
            }
            
            _logger.LogWarning("AUDIO_FILE_CORRUPT", new { zoneId, path = localPath, size = info.Length });
        }

        return null;
    }
}
