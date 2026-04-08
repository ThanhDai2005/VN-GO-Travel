namespace MauiApp1.Services;

/// <summary>
/// Deterministic stub: prefixes target language. Replace with e.g. Azure/Google translator implementing <see cref="ITranslationProvider"/>.
/// </summary>
public sealed class MockTranslationProvider : ITranslationProvider
{
    public Task<TranslationResult> TranslateAsync(string text, string fromLang, string toLang, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(text))
            return Task.FromResult(new TranslationResult(text, true));

        var from = string.IsNullOrWhiteSpace(fromLang) ? "en" : fromLang.Trim().ToLowerInvariant();
        var to = string.IsNullOrWhiteSpace(toLang) ? "?" : toLang.Trim().ToLowerInvariant();
        if (from == to)
            return Task.FromResult(new TranslationResult(text, true));

        return Task.FromResult(new TranslationResult($"[{to}]{text}", true));
    }
}
