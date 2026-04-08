namespace MauiApp1.Services;

/// <summary>
/// Pluggable translation (mock, cloud API, on-device). Inject a real implementation in <see cref="MauiProgram"/>.
/// </summary>
public interface ITranslationProvider
{
    /// <summary>Translate a single text segment. Empty input should yield <see cref="TranslationResult.Succeeded"/> true. On failure, return original <paramref name="text"/> with <see cref="TranslationResult.Succeeded"/> false so callers skip caching.</summary>
    Task<TranslationResult> TranslateAsync(string text, string fromLang, string toLang, CancellationToken cancellationToken = default);
}
