namespace MauiApp1.Services;

public interface IPreferredLanguageService
{
    IReadOnlyList<string> SupportedCodes { get; }

    /// <summary>Reads <see cref="PreferenceKeys.PreferredLanguage"/>; defaults to <c>en</c>.</summary>
    string GetStoredOrDefault();

    /// <summary>Persists preference and raises <see cref="PreferredLanguageChanged"/>.</summary>
    string SetAndPersist(string code);

    event EventHandler<string>? PreferredLanguageChanged;
}
