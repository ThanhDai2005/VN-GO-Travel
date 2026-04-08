using Microsoft.Maui.Media;
using System.Diagnostics;
using System.Collections.Concurrent;

namespace MauiApp1.Services;

/// <summary>
/// Singleton TTS wrapper with production-grade stability and thread-safety.
/// Features: 
/// - Thread-safe, once-only locale caching using SemaphoreSlim and double-check locking.
/// - Serialized SpeakAsync calls to prevent platform engine race conditions.
/// - Cold-start warm-up logic for Android stability.
/// - Robust error handling without silent failures.
/// </summary>
public class AudioService
{
    private readonly object _syncLock = new();
    private CancellationTokenSource? _currentCts;

    // ── Static Concurrency & Cache ──
    private static readonly SemaphoreSlim _initSemaphore = new(1, 1);
    private static readonly SemaphoreSlim _speakSemaphore = new(1, 1);
    private static List<Locale>? _allLocales;
    private static bool _isWarmedUp;

    private static readonly ConcurrentDictionary<string, Locale?> _localeCache = new(StringComparer.OrdinalIgnoreCase);

    // ── Instance Cache & Debounce ──
    private string? _lastPoiCode;
    private string? _lastLanguage;
    private DateTime _lastSpeakTime = DateTime.MinValue;
    private static readonly TimeSpan DebounceWindow = TimeSpan.FromSeconds(2.5);

    // Maps our short lang codes to preferred BCP-47 locale tags.
    private static readonly Dictionary<string, string[]> LangToLocales = new(StringComparer.OrdinalIgnoreCase)
    {
        ["vi"] = ["vi-VN"],
        ["en"] = ["en-US", "en-GB"],
        ["ja"] = ["ja-JP"],
        ["ko"] = ["ko-KR"],
        ["fr"] = ["fr-FR", "fr-CA"],
        ["zh"] = ["zh-CN", "zh-TW"],
        ["de"] = ["de-DE", "de-AT"],
        ["es"] = ["es-ES", "es-MX"],
        ["it"] = ["it-IT"],
        ["ru"] = ["ru-RU"],
        ["pt"] = ["pt-PT", "pt-BR"]
    };

    /// <summary>
    /// Speaks <paramref name="text"/> using the TTS voice best matching <paramref name="languageCode"/>.
    /// Serializes all platform calls to prevent state corruption on Android/iOS.
    /// </summary>
    public async Task SpeakAsync(string poiCode, string text, string languageCode)
    {
        if (string.IsNullOrWhiteSpace(text)) return;

        CancellationTokenSource cts;
        lock (_syncLock)
        {
            var now = DateTime.UtcNow;
            if (string.Equals(_lastPoiCode, poiCode, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(_lastLanguage, languageCode, StringComparison.OrdinalIgnoreCase))
            {
                if (now - _lastSpeakTime < DebounceWindow)
                {
                    Debug.WriteLine($"[AUDIO] SpeakAsync debounced for code={poiCode}");
                    return;
                }
            }

            _lastPoiCode = poiCode;
            _lastLanguage = languageCode;
            _lastSpeakTime = now;
            
            _currentCts?.Cancel();
            _currentCts?.Dispose();
            _currentCts = new CancellationTokenSource();
            cts = _currentCts;
        }

        // --- Serialization Level ---
        // Ensure only one TTS call hits the platform engine at a time.
        // We pass the token to WaitAsync so that if a newer request cancels this one,
        // we stop waiting immediately without blocking the queue.
        try
        {
            await _speakSemaphore.WaitAsync(cts.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            return;
        }
        try
        {
            if (cts.IsCancellationRequested) return;

            // --- Lazy Initialization Level ---
            await EnsureInitializedAsync().ConfigureAwait(false);

            if (cts.IsCancellationRequested) return;

            var selectedLocale = await ResolveLocaleAsync(languageCode).ConfigureAwait(false);
            
            var options = new SpeechOptions
            {
                Pitch  = 1.0f,
                Volume = 1.0f,
                Locale = selectedLocale 
            };

            Debug.WriteLine($"[AUDIO] Speaking: lang={languageCode} voice={selectedLocale?.Id ?? "default"} textLen={text.Length}");
            await TextToSpeech.Default.SpeakAsync(text, options, cts.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            Debug.WriteLine($"[AUDIO] SpeakAsync terminal ERROR: {ex.Message}");
        }
        finally
        {
            _speakSemaphore.Release();
        }
    }

    public void Stop()
    {
        lock (_syncLock)
        {
            _currentCts?.Cancel();
            Debug.WriteLine("[AUDIO] Stop requested");
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Thread-Safe Initialization
    // ─────────────────────────────────────────────────────────────────────────

    private static async Task EnsureInitializedAsync()
    {
        // Double-check lock pattern for performance
        if (_allLocales != null && _isWarmedUp) return;

        await _initSemaphore.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_allLocales == null)
            {
                Debug.WriteLine("[AUDIO] Initializing global TTS locale list...");
                // Note: GetLocalesAsync is very expensive on first call.
                var locales = await TextToSpeech.Default.GetLocalesAsync().ConfigureAwait(false);
                _allLocales = locales?.ToList() ?? new List<Locale>();
                Debug.WriteLine($"[AUDIO] Initialized with {_allLocales.Count} supported locales.");
            }

            if (!_isWarmedUp)
            {
                Debug.WriteLine("[AUDIO] Performing cold-start warm-up speak...");
                // Silent speak ensures engine is in Active state before first user request.
                // We use a short timeout to prevent a platform hang from blocking initialization forever.
                using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                await TextToSpeech.Default.SpeakAsync(" ", new SpeechOptions { Volume = 0 }, timeoutCts.Token).ConfigureAwait(false);
                _isWarmedUp = true;
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[AUDIO] EnsureInitializedAsync failure: {ex.Message}");
            // We do NOT set _allLocales if failed, allowing retry on next request.
        }
        finally
        {
            _initSemaphore.Release();
        }
    }

    private static async Task<Locale?> ResolveLocaleAsync(string langCode)
    {
        if (_localeCache.TryGetValue(langCode, out var cached)) return cached;
        
        // We assume EnsureInitializedAsync was already called by the serialize-managed SpeakAsync.
        if (_allLocales == null) return null;

        Locale? bestMatch = null;

        // 1. Preferred BCP-47 mapping
        if (LangToLocales.TryGetValue(langCode, out var preferred))
        {
            foreach (var tag in preferred)
            {
                var parts = tag.Split('-');
                var tlang = parts[0];
                var country = parts.Length > 1 ? parts[1] : "";

                bestMatch = _allLocales.FirstOrDefault(l =>
                    string.Equals(l.Language, tlang, StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(l.Country,  country, StringComparison.OrdinalIgnoreCase));

                if (bestMatch != null) break;
            }
        }

        // 2. Loose match (Starts with language prefix)
        if (bestMatch == null)
        {
            bestMatch = _allLocales.FirstOrDefault(l =>
                l.Language.StartsWith(langCode, StringComparison.OrdinalIgnoreCase));
        }

        // 3. Fallback: en-US (The most robust voice for character set handling)
        if (bestMatch == null)
        {
            Debug.WriteLine($"[AUDIO] Fallback: No native voice for '{langCode}', using en-US.");
            bestMatch = _allLocales.FirstOrDefault(l =>
                string.Equals(l.Language, "en", StringComparison.OrdinalIgnoreCase) &&
                string.Equals(l.Country, "US", StringComparison.OrdinalIgnoreCase));
        }

        _localeCache[langCode] = bestMatch;
        return bestMatch;
    }
}