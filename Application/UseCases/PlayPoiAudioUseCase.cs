using MauiApp1.ApplicationContracts.Services;

namespace MauiApp1.Application.UseCases;

public sealed class PlayPoiAudioUseCase
{
    private readonly IAudioPlayerService _audioPlayer;

    public PlayPoiAudioUseCase(IAudioPlayerService audioPlayer)
    {
        _audioPlayer = audioPlayer;
    }

    public async Task ExecuteAsync(string audioUrl, string zoneId, CancellationToken ct = default)
    {
        await _audioPlayer.PlayAsync(audioUrl, zoneId, ct).ConfigureAwait(false);
    }
}
