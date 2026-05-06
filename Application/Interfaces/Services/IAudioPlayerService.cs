namespace MauiApp1.ApplicationContracts.Services;

public interface IAudioPlayerService
{
    // Legacy TTS support
    Task SpeakAsync(string poiCode, string text, string languageCode, CancellationToken ct = default);

    // Production MP3 support (TASK 1)
    Task PlayAsync(string audioUrl, string zoneId, CancellationToken ct = default);
    void Pause();
    void Resume();
    Task StopAsync(CancellationToken ct = default);
    void Seek(TimeSpan position);
    
    // State
    bool IsPlaying { get; }
    bool IsBuffering { get; }
    TimeSpan CurrentPosition { get; }
    TimeSpan Duration { get; }
}
