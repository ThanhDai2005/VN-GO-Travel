using System.Diagnostics;
using GTranslate.Translators;

namespace MauiApp1.Services;

/// <summary>Free HTTP-based translation via the <c>GTranslate</c> library (Google public endpoint). Failures return the original segment and <see cref="TranslationResult.Succeeded"/> false.</summary>
public sealed class GTranslateTranslationProvider : ITranslationProvider
{
    private readonly GoogleTranslator _translator = new();

    private static string MapToServiceCode(string lang)
    {
        var c = string.IsNullOrWhiteSpace(lang) ? "en" : lang.Trim().ToLowerInvariant();
        // GTranslate / Google expect common BCP-47 style for Chinese in many cases.
        return c == "zh" ? "zh-CN" : c;
    }

    /// <inheritdoc />
    public async Task<TranslationResult> TranslateAsync(string text, string fromLang, string toLang, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(text))
            return new TranslationResult(text, true);

        var from = MapToServiceCode(fromLang);
        var to = MapToServiceCode(toLang);
        if (string.Equals(from, to, StringComparison.OrdinalIgnoreCase))
            return new TranslationResult(text, true);

        try
        {
            var apiTask = _translator.TranslateAsync(text, from, to);
            var timeoutTask = Task.Delay(TimeSpan.FromSeconds(5), cancellationToken);
            var completed = await Task.WhenAny(apiTask, timeoutTask).ConfigureAwait(false);
            if (completed != apiTask)
            {
                Debug.WriteLine("[GTranslate] Translation timed out (5s) or cancelled.");
                return new TranslationResult(text, false);
            }

            var result = await apiTask.ConfigureAwait(false);
            var translated = result.Translation;
            if (string.IsNullOrWhiteSpace(translated))
                return new TranslationResult(text, false);

            return new TranslationResult(translated, true);
        }
        catch (OperationCanceledException ex)
        {
            Debug.WriteLine($"[GTranslate] cancelled: {ex.Message}");
            return new TranslationResult(text, false);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[GTranslate] {ex.GetType().Name}: {ex.Message}");
            return new TranslationResult(text, false);
        }
    }
}
