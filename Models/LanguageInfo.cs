namespace MauiApp1.Models;

/// <summary>
/// Represents a supported language in the system.
/// Intended to be used for data-binding in language selection UIs.
/// </summary>
public record LanguageInfo(string Code, string DisplayName, string NativeName);
