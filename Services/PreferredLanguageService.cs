using Microsoft.Maui.Storage;
using System.Globalization;
using MauiApp1.Models;
using System.Diagnostics;

namespace MauiApp1.Services;

public sealed class PreferredLanguageService : IPreferredLanguageService
{
    // Define the canonical, scalable list of supported languages
    public static readonly IReadOnlyList<LanguageInfo> SupportedLanguages = new List<LanguageInfo>
    {
        new("vi", "Vietnamese", "Tiếng Việt"),
        new("en", "English", "English"),
        new("ja", "Japanese", "日本語"),
        new("ko", "Korean", "한국어"),
        new("fr", "French", "Français"),
        new("zh", "Chinese", "中文")
    };

    public static readonly string[] Codes = SupportedLanguages.Select(l => l.Code).ToArray();

    public IReadOnlyList<string> SupportedCodes => Codes;

    public event EventHandler<string>? PreferredLanguageChanged;

    public PreferredLanguageService()
    {
        // First-launch system language detection
        if (!Preferences.ContainsKey(PreferenceKeys.PreferredLanguage))
        {
            try
            {
                var sysLang = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName.ToLowerInvariant();
                var initialCode = Codes.Contains(sysLang) ? sysLang : "vi";
                Debug.WriteLine($"[LANG-SVC] First launch detected. System lang: {sysLang}. Setting to: {initialCode}");
                Preferences.Set(PreferenceKeys.PreferredLanguage, initialCode);
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[LANG-SVC] Auto-detect failed, defaulting to vi. Err: {ex}");
                Preferences.Set(PreferenceKeys.PreferredLanguage, "vi");
            }
        }
    }

    public string GetStoredOrDefault()
    {
        var raw = Preferences.Get(PreferenceKeys.PreferredLanguage, "vi");
        return NormalizeCode(raw);
    }

    public string SetAndPersist(string code)
    {
        var n = NormalizeCode(code);
        var prev = Preferences.Get(PreferenceKeys.PreferredLanguage, "vi");
        Preferences.Set(PreferenceKeys.PreferredLanguage, n);
        if (!string.Equals(NormalizeCode(prev), n, StringComparison.Ordinal))
            PreferredLanguageChanged?.Invoke(this, n);
        return n;
    }

    public static string NormalizeCode(string? code)
    {
        var c = string.IsNullOrWhiteSpace(code) ? "vi" : code.Trim().ToLowerInvariant();
        return Codes.Contains(c) ? c : "vi";
    }
}
