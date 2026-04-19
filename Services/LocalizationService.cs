using MauiApp1.ApplicationContracts.Services;
using MauiApp1.Models;
using System.Diagnostics;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace MauiApp1.Services;

/// <summary>
/// Singleton, in-memory localization service.
/// Loads all POI text content from <c>pois.json</c> exactly once at startup.
/// All subsequent lookups are O(1) and fully synchronous; the lookup dictionary is
/// guarded by <c>lock (_lookup)</c> for reads and writes so dynamic injection is thread-safe.
/// </summary>
public sealed class LocalizationService : ILocalizationService
{
    // (Code_UPPER, lang_lower) → localized text block
    private readonly Dictionary<(string Code, string Lang), PoiLocalization> _lookup = new();

    // Geo-only Pois, one per unique Code — used for the initial SQLite seed.
    // Id = Code (single row per POI in DB after the Phase-1 refactor).
    private readonly List<Poi> _corePois = new();

    private bool _initialized;
    private readonly SemaphoreSlim _initGate = new(1, 1);
    private readonly ILogger<LocalizationService> _logger;

    public LocalizationService(ILogger<LocalizationService> logger)
    {
        _logger = logger;
    }

    public bool IsInitialized => _initialized;

    // ─────────────────────────────────────────────────────────────────────────
    // Initialization
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Reads <c>pois.json</c> and builds the in-memory lookup + core POI list.
    /// Idempotent — safe to call multiple times; only the first call does work.
    /// </summary>
    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (_initialized) return;

        await _initGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (_initialized) return;   // double-check after acquiring gate

            using var stream = await FileSystem.OpenAppPackageFileAsync("pois.json").ConfigureAwait(false);
            using var reader = new StreamReader(stream);
            var json = (await reader.ReadToEndAsync().ConfigureAwait(false))
                           .Replace("\u00A0", " ");    // strip non-breaking spaces

            // Define a local DTO to match the JSON structure (vi-only seed data).
            var allRaw = JsonSerializer.Deserialize<List<PoiRaw>>(json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                ?? new List<PoiRaw>();

            var seenCodes = new HashSet<string>(StringComparer.Ordinal);

            foreach (var r in allRaw)
            {
                if (string.IsNullOrWhiteSpace(r.Code) || string.IsNullOrWhiteSpace(r.LanguageCode))
                    continue;

                var code = r.Code.Trim().ToUpperInvariant();
                var lang = r.LanguageCode.Trim().ToLowerInvariant();

                // Create the localization entry for the lookup.
                var loc = new PoiLocalization
                {
                    Code = code,
                    LanguageCode = lang,
                    Name = r.Name ?? "",
                    Summary = r.Summary ?? "",
                    NarrationShort = r.NarrationShort ?? "",
                    NarrationLong = r.NarrationLong ?? ""
                };

                lock (_lookup)
                {
                    _lookup[(code, lang)] = loc;
                }

                // One geo-only core row per Code for DB seeding.
                if (seenCodes.Add(code))
                {
                    _corePois.Add(new Poi
                    {
                        Id        = code,   // Id = Code: single row per POI in DB
                        Code      = code,
                        Latitude  = r.Latitude,
                        Longitude = r.Longitude,
                        Radius    = r.Radius <= 0 ? 50 : r.Radius,
                        Priority  = r.Priority,
                        Localization = loc // Set vi localization directly for the seeded objects
                    });
                }
            }

            _initialized = true;
            Debug.WriteLine(
                $"[LOC-SVC] Initialized: {_lookup.Count} localization entries across " +
                $"{_corePois.Count} distinct POIs.");
        }
        finally
        {
            _initGate.Release();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Runtime API
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Returns the <see cref="PoiLocalization"/> for <paramref name="code"/> in
    /// <paramref name="lang"/>. Backwards-compatible convenience wrapper.
    /// <para>
    /// Fallback chain: <paramref name="lang"/> → <c>"vi"</c> → <c>"en"</c> → first available → <see langword="null"/>.
    /// </para>
    /// <para>
    /// Vietnamese is preferred over English as the primary app language is Vietnamese.
    /// English only acts as a universal fallback when Vietnamese is also missing.
    /// </para>
    /// </summary>
    public PoiLocalization? GetLocalization(string code, string lang)
        => GetLocalizationResult(code, lang).Localization;

    /// <summary>
    /// Same as <see cref="GetLocalization"/> but returns a <see cref="LocalizationResult"/>
    /// that includes <c>IsFallback</c> and <c>UsedLang</c> for transparent UI display.
    /// </summary>
    public LocalizationResult GetLocalizationResult(string code, string lang)
    {
        lang = (lang ?? "").Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(code)) return LocalizationResult.Miss(lang);

        code = code.Trim().ToUpperInvariant();

        lock (_lookup)
        {
            // 1. Exact match — user's requested language
            if (_lookup.TryGetValue((code, lang), out var exact))
            {
                Debug.WriteLine($"[LOC-SVC] SUCCESS: Code={code} | Requested={lang} | Used={lang} | Fallback=False");
                return new LocalizationResult { Localization = exact, IsFallback = false, UsedLang = lang, RequestedLang = lang };
            }

            // 2. Base Language fallback ('vi')
            if (_lookup.TryGetValue((code, "vi"), out var vi))
            {
                Debug.WriteLine($"[LOC-SVC] FALLBACK: Code={code} | Requested={lang} | Used=vi | Fallback=True");
                _logger.LogWarning(
                    "[TranslationWarning] Fallback language used | Code={Code} | RequestedLang={RequestedLang} | UsedLang={UsedLang}",
                    code,
                    lang,
                    "vi");
                return new LocalizationResult { Localization = vi, IsFallback = true, UsedLang = "vi", RequestedLang = lang };
            }

            // Final fallback: Any available language for this code (last resort)
            foreach (var kv in _lookup)
            {
                if (kv.Key.Code == code)
                {
                    Debug.WriteLine($"[LOC-SVC] FALLBACK: Code={code} | Requested={lang} | Used={kv.Key.Lang} | Fallback=True");
                    _logger.LogWarning(
                        "[TranslationWarning] Fallback language used | Code={Code} | RequestedLang={RequestedLang} | UsedLang={UsedLang}",
                        code,
                        lang,
                        kv.Key.Lang);
                    return new LocalizationResult { Localization = kv.Value, IsFallback = true, UsedLang = kv.Key.Lang, RequestedLang = lang };
                }
            }

            Debug.WriteLine($"[LOC-SVC] MISS: Code={code} | Requested={lang} | No translations available.");
            _logger.LogWarning(
                "[TranslationWarning] Missing translation | Code={Code} | Lang={Lang}",
                code,
                lang);
            return LocalizationResult.Miss(lang);
        }
    }

    /// <summary>
    /// Returns geo-only <see cref="Poi"/> objects (one per unique Code, no text)
    /// suitable for inserting into SQLite via <see cref="PoiDatabase"/>.
    /// </summary>
    public IReadOnlyList<Poi> GetCorePoisForSeeding() => _corePois;

    /// <summary>
    /// Scans all core POIs against all supported system languages to output
    /// a report of which translations are missing, facilitating focused content addition.
    /// </summary>
    public void CheckMissingTranslations()
    {
        Debug.WriteLine("\n[LOC-REPORT] --- Translation Coverage Check ---");
        var supportedLangs = PreferredLanguageService.Codes;

        int totalPois = _corePois.Count;
        int fullyTranslated = 0;
        int totalMissing = 0;

        foreach (var poi in _corePois)
        {
            var missing = new List<string>();
            foreach (var lang in supportedLangs)
            {
                bool hasEntry;
                lock (_lookup)
                {
                    hasEntry = _lookup.ContainsKey((poi.Code, lang));
                }

                if (!hasEntry)
                {
                    missing.Add(lang);
                    totalMissing++;
                }
            }

            if (missing.Count == 0)
            {
                fullyTranslated++;
            }
            else
            {
                Debug.WriteLine($"[LOC-REPORT] POI '{poi.Code}' is missing: {string.Join(", ", missing)}");
            }
        }

        Debug.WriteLine($"[LOC-REPORT] Coverage Summary: {fullyTranslated}/{totalPois} POIs are fully translated.");
        Debug.WriteLine($"[LOC-REPORT] Total missing language entries: {totalMissing}");
        Debug.WriteLine("[LOC-REPORT] ------------------------------------\n");
    }

    /// <summary>
    /// Injects an on-demand translated string set into the in-memory lookup.
    /// Future synchronous UI calls will immediately receive this translation.
    /// </summary>
    public void RegisterDynamicTranslation(string code, string lang, PoiLocalization loc)
    {
        if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(lang) || loc == null) return;
        
        var normCode = code.Trim().ToUpperInvariant();
        var normLang = lang.Trim().ToLowerInvariant();
        lock (_lookup)
        {
            if (_lookup.TryGetValue((normCode, normLang), out var existing))
            {
                var sameName = string.Equals(existing.Name, loc.Name, StringComparison.Ordinal);
                var sameSummary = string.Equals(existing.Summary, loc.Summary, StringComparison.Ordinal);
                if (!sameName || !sameSummary)
                {
                    _logger.LogWarning(
                        "[TranslationWarning] Inconsistent dynamic translation overwrite | Code={Code} | Lang={Lang}",
                        normCode,
                        normLang);
                }
            }

            _lookup[(normCode, normLang)] = loc;
        }
        Debug.WriteLine($"[LOC-SVC] Injected dynamic translation for Code={code}, Lang={lang}");
    }

    /// <summary>
    /// Matching DTO for pois.json deserialization.
    /// </summary>
    private sealed class PoiRaw
    {
        public string Code { get; set; } = "";
        public string LanguageCode { get; set; } = "";
        public string Name { get; set; } = "";
        public string Summary { get; set; } = "";
        public string NarrationShort { get; set; } = "";
        public string NarrationLong { get; set; } = "";
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public double Radius { get; set; }
        public int Priority { get; set; }
    }
}
