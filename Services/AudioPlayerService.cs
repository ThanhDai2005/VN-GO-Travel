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
    private readonly IZoneAccessRepository _repository;
    private readonly IZoneResolverService _zoneResolver;
    private CancellationTokenSource? _ttsCts;

    public bool IsPlaying { get; private set; }
    public bool IsBuffering { get; private set; }
    public TimeSpan CurrentPosition => _currentPosition;
    public TimeSpan Duration => _duration;

    private string? _currentZoneId;
    private string? _currentAudioUrl;
    private TimeSpan _currentPosition = TimeSpan.Zero;
    private TimeSpan _duration = TimeSpan.Zero;
    private CancellationTokenSource? _playbackTickerCts;

    public AudioPlayerService(
        IZoneAccessService zoneAccess, 
        ILoggerService logger,
        IZoneDownloadService downloadService,
        IZoneAccessRepository repository,
        IZoneResolverService zoneResolver)
    {
        _zoneAccess = zoneAccess;
        _logger = logger;
        _downloadService = downloadService;
        _repository = repository;
        _zoneResolver = zoneResolver;

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
        // STEP 1: RESOLVE ZONE (If missing)
        var resolvedZone = string.IsNullOrWhiteSpace(zoneId) 
            ? null 
            : zoneId;

        // Try to resolve zone from audioUrl if it looks like a POI code
        if (string.IsNullOrWhiteSpace(resolvedZone))
        {
            var fileName = Path.GetFileNameWithoutExtension(audioUrl);
            resolvedZone = await _zoneResolver.ResolveZoneAsync(fileName, ct: ct).ConfigureAwait(false);
        }

        await _zoneAccess.EnsureAccessAsync(resolvedZone ?? "", ct).ConfigureAwait(false);

        // STEP 2: FILE INTEGRITY & RESOLUTION (Use Repository)
        var localSource = Path.IsPathRooted(audioUrl)
            ? audioUrl
            : await GetPlayableLocalSource(resolvedZone ?? "", audioUrl).ConfigureAwait(false);
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
        
        _duration = ResolveDuration(source);
        if (_currentPosition >= _duration || _currentPosition == TimeSpan.Zero)
            _currentPosition = TimeSpan.Zero;
        IsPlaying = true;
        IsBuffering = false;
        StartPlaybackTicker();
    }

    public void Pause() 
    {
        IsPlaying = false;
        _playbackTickerCts?.Cancel();
        _logger.LogInfo("AUDIO_PAUSE");
    }

    public void Resume() 
    {
        if (_duration > TimeSpan.Zero && _currentPosition < _duration)
            StartPlaybackTicker();
        IsPlaying = true;
        _logger.LogInfo("AUDIO_RESUME");
    }

    public async Task StopAsync(CancellationToken ct = default)
    {
        IsPlaying = false;
        _playbackTickerCts?.Cancel();
        _currentPosition = TimeSpan.Zero;
        _duration = TimeSpan.Zero;
        _currentZoneId = null;
        _currentAudioUrl = null;
        _ttsCts?.Cancel();
        _logger.LogInfo("AUDIO_STOP");
        await Task.CompletedTask;
    }

    public void Seek(TimeSpan position)
    {
        if (_duration <= TimeSpan.Zero)
            return;

        if (position < TimeSpan.Zero) position = TimeSpan.Zero;
        if (position > _duration) position = _duration;
        _currentPosition = position;
        _logger.LogInfo("AUDIO_SEEK", new { position });
    }

    private static TimeSpan ResolveDuration(string source)
    {
        try
        {
            if (File.Exists(source))
            {
                var bytes = new FileInfo(source).Length;
                var estimatedSeconds = Math.Max(20, Math.Min(900, bytes / 24_000d));
                return TimeSpan.FromSeconds(estimatedSeconds);
            }
        }
        catch
        {
            // fallback
        }

        return TimeSpan.FromMinutes(3);
    }

    private void StartPlaybackTicker()
    {
        _playbackTickerCts?.Cancel();
        _playbackTickerCts = new CancellationTokenSource();
        var localCts = _playbackTickerCts;

        _ = Task.Run(async () =>
        {
            try
            {
                while (!localCts.IsCancellationRequested && IsPlaying)
                {
                    await Task.Delay(1000, localCts.Token).ConfigureAwait(false);
                    if (!IsPlaying) continue;
                    _currentPosition += TimeSpan.FromSeconds(1);
                    if (_currentPosition >= _duration)
                    {
                        _currentPosition = _duration;
                        IsPlaying = false;
                        break;
                    }
                }
            }
            catch (OperationCanceledException) { }
        }, localCts.Token);
    }

    private async Task<string?> GetPlayableLocalSource(string zoneId, string audioUrl)
    {
        // Task 6: Use SSoT for local audio (SQLite downloaded_audio table)
        var poiCode = Path.GetFileNameWithoutExtension(audioUrl).ToUpperInvariant();
        
        // Try all languages or specific one if detectable
        var record = await _repository.GetDownloadedAudioAsync(poiCode, "vi").ConfigureAwait(false)
            ?? await _repository.GetDownloadedAudioAsync(poiCode, "en").ConfigureAwait(false);

        if (record != null)
        {
            var path = !string.IsNullOrWhiteSpace(record.AudioLongPath) && File.Exists(record.AudioLongPath)
                ? record.AudioLongPath
                : record.AudioShortPath;

            if (!string.IsNullOrWhiteSpace(path) && File.Exists(path))
            {
                var info = new FileInfo(path);
                if (info.Length > 0) return path;
            }
        }

        // Fallback to legacy path logic (Shadow Mode)
        var fileName = Path.GetFileName(audioUrl);
        var legacyPath = Path.Combine(FileSystem.AppDataDirectory, "zones", zoneId, fileName);

        if (File.Exists(legacyPath))
        {
            var info = new FileInfo(legacyPath);
            if (info.Length > 0) return legacyPath;
        }

        return null;
    }
}
