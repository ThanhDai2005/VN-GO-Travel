using Microsoft.Maui.Media;

namespace MauiApp1.Services;

public class AudioService
{
    private readonly object _syncLock = new();
    private CancellationTokenSource? _currentCts;

    public async Task SpeakAsync(string text, string languageCode)
    {
        if (string.IsNullOrWhiteSpace(text))
            return;

        CancellationTokenSource cts;

        lock (_syncLock)
        {
            _currentCts?.Cancel();
            _currentCts?.Dispose();

            _currentCts = new CancellationTokenSource();
            cts = _currentCts;
        }

        try
        {
            var locales = await TextToSpeech.Default.GetLocalesAsync();

            var selectedLocale = locales.FirstOrDefault(l =>
                string.Equals(l.Language, languageCode, StringComparison.OrdinalIgnoreCase))
                ?? locales.FirstOrDefault(l =>
                    l.Language.StartsWith(languageCode, StringComparison.OrdinalIgnoreCase));

            var options = new SpeechOptions
            {
                Pitch = 1.0f,
                Volume = 1.0f
            };

            if (selectedLocale != null)
                options.Locale = selectedLocale;

            await TextToSpeech.Default.SpeakAsync(text, options, cts.Token);
        }
        catch (OperationCanceledException)
        {
            // bình thường khi audio bị thay thế hoặc stop
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"TTS error: {ex.Message}");
        }
    }

    public void Stop()
    {
        lock (_syncLock)
        {
            _currentCts?.Cancel();
        }
    }
}