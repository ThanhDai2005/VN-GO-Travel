using Microsoft.Maui.Media;
using System.Diagnostics;

namespace MauiApp1.Services;

/// <summary>
/// Singleton TTS wrapper.
/// Guarantees only one utterance plays at a time: every new <see cref="SpeakAsync"/>
/// call cancels any in-flight speech before starting. <see cref="Stop"/> also cancels.
/// </summary>
public class AudioService
{
    private readonly object _syncLock = new();
    private CancellationTokenSource? _currentCts;

    // ── Cache & Debounce State ──
    private string? _lastPoiCode;
    private string? _lastLanguage;
    private DateTime _lastSpeakTime = DateTime.MinValue;
    private static readonly TimeSpan DebounceWindow = TimeSpan.FromSeconds(2.5);

    private static readonly Dictionary<string, Locale?> _localeCache = new(StringComparer.OrdinalIgnoreCase);

    // Maps our short lang codes to preferred BCP-47 locale tags for TTS voice selection.
    // When the device has a matching locale, TTS will use the correct regional voice.
    // Matching strategy: exact tag first, then Language prefix match.
    private static readonly Dictionary<string, string[]> LangToLocales = new(StringComparer.OrdinalIgnoreCase)
    {
        ["vi"] = ["vi-VN"],
        ["en"] = ["en-US", "en-GB"],
        ["ja"] = ["ja-JP"],
        ["ko"] = ["ko-KR"],
        ["fr"] = ["fr-FR", "fr-CA"],
        ["zh"] = ["zh-CN", "zh-TW"],
    };

    /// <summary>
    /// Speaks <paramref name="text"/> using the TTS voice best matching
    /// <paramref name="languageCode"/>. Cancels any currently playing audio first,
    /// so there is never more than one utterance in flight.
    /// Debounces consecutive requests for the exact same <paramref name="poiCode"/> and language.
    /// </summary>
    public async Task SpeakAsync(string poiCode, string text, string languageCode)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            Debug.WriteLine("[AUDIO] SpeakAsync skipped — empty text");
            return;
        }

        CancellationTokenSource cts;
        lock (_syncLock)
        {
            var now = DateTime.UtcNow;
            if (string.Equals(_lastPoiCode, poiCode, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(_lastLanguage, languageCode, StringComparison.OrdinalIgnoreCase))
            {
                if (now - _lastSpeakTime < DebounceWindow)
                {
                    Debug.WriteLine($"[AUDIO] SpeakAsync debounced (ignored) — code={poiCode} lang={languageCode} within 2.5s");
                    return;
                }
            }

            _lastPoiCode = poiCode;
            _lastLanguage = languageCode;
            _lastSpeakTime = now;
            
            // Cancel previous utterance (no-op if already completed).
            _currentCts?.Cancel();
            _currentCts?.Dispose();
            _currentCts = new CancellationTokenSource();
            cts = _currentCts;
        }

        Debug.WriteLine($"[AUDIO] SpeakAsync start lang={languageCode} textLen={text.Length}");

        try
        {
            var selectedLocale = await ResolveLocaleAsync(languageCode).ConfigureAwait(false);

            Debug.WriteLine(selectedLocale != null
                ? $"[AUDIO] Locale resolved: {selectedLocale.Language}-{selectedLocale.Country} for lang={languageCode}"
                : $"[AUDIO] No locale found for lang={languageCode} — using system default");

            if (cts.IsCancellationRequested)
            {
                Debug.WriteLine("[AUDIO] SpeakAsync aborted before speak — superseded by newer call");
                return;
            }

            var options = new SpeechOptions
            {
                Pitch  = 1.0f,
                Volume = 1.0f,
                Locale = selectedLocale   // null = system default (safe)
            };

            await TextToSpeech.Default.SpeakAsync(text, options, cts.Token).ConfigureAwait(false);
            Debug.WriteLine($"[AUDIO] SpeakAsync completed lang={languageCode}");
        }
        catch (OperationCanceledException)
        {
            // Normal: audio superseded by newer PlayPoiAsync call or StopAudio().
            Debug.WriteLine("[AUDIO] SpeakAsync cancelled (superseded or stopped)");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[AUDIO] SpeakAsync error lang={languageCode}: {ex.Message}");
        }
    }

    /// <summary>
    /// Stops any in-flight audio immediately. Idempotent.
    /// Does NOT clear <c>_activeNarrationPoiCode</c> in <c>MapViewModel</c> —
    /// that is the caller's responsibility via <c>MapViewModel.StopAudio()</c>.
    /// </summary>
    public void Stop()
    {
        lock (_syncLock)
        {
            _currentCts?.Cancel();
            Debug.WriteLine("[AUDIO] Stop called");
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Locale resolution
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Returns the best available <see cref="Locale"/> on the device for
    /// <paramref name="langCode"/>.
    /// <para>
    /// Strategy:
    /// <list type="number">
    ///   <item>Check our <see cref="LangToLocales"/> map for preferred BCP-47 tags.</item>
    ///   <item>For each candidate tag, try exact match on <c>Language-Country</c>.</item>
    ///   <item>Fall back to any locale whose <c>Language</c> starts with the lang code.</item>
    ///   <item>Return <see langword="null"/> (system default voice) if nothing matches.</item>
    /// </list>
    /// </para>
    /// </summary>
    private static async Task<Locale?> ResolveLocaleAsync(string langCode)
    {
        if (_localeCache.TryGetValue(langCode, out var cached))
        {
            Debug.WriteLine($"[AUDIO] Locale cache hit for lang={langCode}");
            return cached;
        }

        try
        {
            var allLocales = (await TextToSpeech.Default.GetLocalesAsync().ConfigureAwait(false))
                             .ToList();

            Locale? bestMatch = null;

            // Try our preferred BCP-47 tags first (exact match).
            if (LangToLocales.TryGetValue(langCode, out var preferred))
            {
                foreach (var tag in preferred)
                {
                    var parts = tag.Split('-');
                    var tlang = parts[0];
                    var country = parts.Length > 1 ? parts[1] : "";

                    var match = allLocales.FirstOrDefault(l =>
                        string.Equals(l.Language, tlang, StringComparison.OrdinalIgnoreCase) &&
                        string.Equals(l.Country,  country, StringComparison.OrdinalIgnoreCase));

                    if (match != null)
                    {
                        bestMatch = match;
                        break;
                    }
                }
            }

            // Loose match: any locale whose Language starts with the requested code.
            if (bestMatch == null)
            {
                bestMatch = allLocales.FirstOrDefault(l =>
                    l.Language.StartsWith(langCode, StringComparison.OrdinalIgnoreCase));
            }

            // Explicit Fallback to en-US if nothing matching is found
            if (bestMatch == null)
            {
                Debug.WriteLine($"[AUDIO] No voice found for '{langCode}' — falling back to en-US explicitly.");
                bestMatch = allLocales.FirstOrDefault(l =>
                    string.Equals(l.Language, "en", StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(l.Country, "US", StringComparison.OrdinalIgnoreCase));
            }
            
            _localeCache[langCode] = bestMatch;
            return bestMatch;
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[AUDIO] ResolveLocaleAsync error: {ex.Message}");
            return null;
        }
    }
}