using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MauiApp1.Models;
using MauiApp1.ApplicationContracts.Repositories;
using Microsoft.Extensions.Logging;
using Microsoft.Maui.Networking;

namespace MauiApp1.Services;

public interface ITranslationResolverService
{
    Task<ResolvedPoiContent> ResolvePoiContentAsync(PoiDto poi, string userLang);
}

public class TranslationResolverService : ITranslationResolverService
{
    private readonly ISmartCacheManager _cache;
    private readonly IQuotaGuardService _quotaGuard;
    private readonly IDeduplicationService _dedup;
    private readonly IJitOptimizationService _jitOpt;
    private readonly ILogger<TranslationResolverService> _logger;
    private readonly IEventTracker _eventTracker;
    private readonly INetworkService _networkService;

    public TranslationResolverService(
        ISmartCacheManager cache,
        IQuotaGuardService quotaGuard,
        IDeduplicationService dedup,
        IJitOptimizationService jitOpt,
        ILogger<TranslationResolverService> logger,
        IEventTracker eventTracker,
        INetworkService networkService)
    {
        _cache = cache;
        _quotaGuard = quotaGuard;
        _dedup = dedup;
        _jitOpt = jitOpt;
        _logger = logger;
        _eventTracker = eventTracker;
        _networkService = networkService;
    }

    public async Task<ResolvedPoiContent> ResolvePoiContentAsync(PoiDto poi, string userLang)
    {
        if (poi == null) throw new ArgumentNullException(nameof(poi));
        
        // 6.1 Generate traceId per request
        string traceId = Guid.NewGuid().ToString("N").Substring(0, 8);
        string targetLang = NormalizeLang(userLang);
        bool isOffline = _networkService.NetworkAccess != NetworkAccess.Internet;

        // 6. FULL MODE HARD GUARD
        var translations = poi.Translations ?? new List<PoiTranslationDto>();
        var fullTranslation = translations.FirstOrDefault(t => t.lang_code == targetLang && t.mode == "full");
        
        if (fullTranslation != null)
        {
            ValidateFullMode(fullTranslation);
            var result = MapFromTranslation(fullTranslation);
            await _cache.SetAsync(poi.Code, targetLang, result, poi.Version, fullTranslation.metadata.translatedVersion, "full", traceId);
            return result;
        }

        int latestTranslationVersion = translations.Any() ? translations.Max(t => t.metadata.translatedVersion) : 0;
        
        // 5. OFFLINE FALLBACK DEPTH (L1 -> L2 -> L3 -> Base)
        // L1 & L2 checked inside SmartCacheManager
        var cached = await _cache.GetAsync(poi.Code, targetLang, poi.Version, latestTranslationVersion, "partial", traceId);
        if (cached != null)
        {
            // 7. L3 CACHE STRICT RULE
            // isOutdated = true -> allow + reduce confidence
            if (cached.UsedOutdated)
            {
                _logger.LogInformation("L3_OUTDATED_ALLOW | traceId: {TraceId} | poi: {Code} | Applying penalty", traceId, poi.Code);
            }
            return cached;
        }

        if (isOffline)
        {
            _logger.LogInformation("OFFLINE_FALLBACK_BASE | traceId: {TraceId} | poi: {Code} | No cache found", traceId, poi.Code);
            return CreateBaseResponse(poi, targetLang, traceId);
        }

        // 3. GLOBAL DEDUPLICATION
        string dedupKey = $"{poi.Code}_{targetLang}_resolution";
        return await _dedup.RunOnceAsync(dedupKey, async () => 
        {
            return await InternalResolve(poi, targetLang, isOffline, traceId);
        });
    }

    private void ValidateFullMode(PoiTranslationDto t)
    {
        if (string.IsNullOrWhiteSpace(t.content.name) || 
            string.IsNullOrWhiteSpace(t.content.summary) || 
            string.IsNullOrWhiteSpace(t.content.narrationShort) || 
            string.IsNullOrWhiteSpace(t.content.narrationLong))
        {
            throw new InvalidOperationException("FULL mode violated: missing field");
        }
    }

    private async Task<ResolvedPoiContent> InternalResolve(PoiDto poi, string lang, bool isOffline, string traceId)
    {
        var result = new ResolvedPoiContent();
        var translations = poi.Translations ?? new List<PoiTranslationDto>();
        
        var partialManual = translations.FirstOrDefault(t => t.lang_code == lang && t.mode == "partial");
        var jitEn = translations.FirstOrDefault(t => t.translationSource == "jit_en");
        var jitVi = translations.FirstOrDefault(t => t.translationSource == "jit_vi");

        var fieldSources = new Dictionary<string, string>();
        
        result.Name = ResolveField("Name", p => p.content.name, partialManual, jitEn, jitVi, poi.Name, isOffline, lang, traceId, out var nSource);
        result.Summary = ResolveField("Summary", p => p.content.summary, partialManual, jitEn, jitVi, poi.Summary, isOffline, lang, traceId, out var sSource);
        result.NarrationShort = ResolveField("NarrationShort", p => p.content.narrationShort, partialManual, jitEn, jitVi, poi.NarrationShort, isOffline, lang, traceId, out var nsSource);
        result.NarrationLong = ResolveField("NarrationLong", p => p.content.narrationLong, partialManual, jitEn, jitVi, poi.NarrationLong, isOffline, lang, traceId, out var nlSource);

        fieldSources["Name"] = nSource;
        fieldSources["Summary"] = sSource;
        fieldSources["NarrationShort"] = nsSource;
        fieldSources["NarrationLong"] = nlSource;

        PopulateResultMetadata(result, poi, fieldSources, translations, lang, isOffline, traceId);
        
        int transVersion = translations.Any() ? translations.Max(t => t.metadata.translatedVersion) : 0;
        await _cache.SetAsync(poi.Code, lang, result, poi.Version, transVersion, "partial", traceId);
        
        return result;
    }

    private string ResolveField(
        string fieldName,
        Func<PoiTranslationDto, string> fieldSelector,
        PoiTranslationDto? manual,
        PoiTranslationDto? jitEn,
        PoiTranslationDto? jitVi,
        string baseValue,
        bool isOffline,
        string targetLang,
        string traceId,
        out string source)
    {
        var visited = new HashSet<string>();

        // 1. Manual
        if (manual != null)
        {
            var val = fieldSelector(manual);
            if (!string.IsNullOrWhiteSpace(val))
            {
                // Outdated override check
                if (manual.metadata.isOutdated && !isOffline)
                {
                    if (jitEn != null && !jitEn.metadata.isOutdated && !string.IsNullOrWhiteSpace(fieldSelector(jitEn)))
                    {
                        if (!_jitOpt.IsCircuitOpen() && _quotaGuard.TryConsumeQuota())
                        {
                            source = "jit_en";
                            _jitOpt.RecordSuccess();
                            LogFieldResolution(fieldName, source, "override_outdated", traceId);
                            return fieldSelector(jitEn);
                        }
                    }
                }
                source = "manual";
                LogFieldResolution(fieldName, source, "primary", traceId);
                return val;
            }
        }
        visited.Add("manual");

        // 7.1 Confidence threshold + Circuit Breaker
        if (jitEn != null && !isOffline && !_jitOpt.IsCircuitOpen() && jitEn.metadata.confidenceScore >= 0.7)
        {
            var val = fieldSelector(jitEn);
            if (!string.IsNullOrWhiteSpace(val))
            {
                if (_quotaGuard.TryConsumeQuota())
                {
                    source = "jit_en";
                    _jitOpt.RecordSuccess();
                    LogFieldResolution(fieldName, source, "fallback", traceId);
                    return val;
                }
            }
        }
        else if (jitEn != null && !isOffline) 
        {
            _logger.LogInformation("JIT_SKIPPED | traceId: {TraceId} | reason: low_confidence_or_breaker | source: jit_en | field: {Field}", traceId, fieldName);
        }
        visited.Add("jit_en");

        if (jitVi != null && !isOffline && !_jitOpt.IsCircuitOpen() && jitVi.metadata.confidenceScore >= 0.7)
        {
            var val = fieldSelector(jitVi);
            if (!string.IsNullOrWhiteSpace(val))
            {
                if (_quotaGuard.TryConsumeQuota())
                {
                    source = "jit_vi";
                    _jitOpt.RecordSuccess();
                    LogFieldResolution(fieldName, source, "fallback", traceId);
                    return val;
                }
            }
        }
        visited.Add("jit_vi");

        source = "base";
        LogFieldResolution(fieldName, source, "final_fallback", traceId);
        return baseValue ?? "";
    }

    private void PopulateResultMetadata(ResolvedPoiContent result, PoiDto poi, Dictionary<string, string> fieldSources, List<PoiTranslationDto> translations, string lang, bool isOffline, string traceId)
    {
        var sources = fieldSources.Values.ToList();
        result.UsedManual = sources.Any(s => s == "manual");
        result.UsedJitEn = sources.Any(s => s == "jit_en");
        result.UsedJitVi = sources.Any(s => s == "jit_vi");
        result.UsedMixedSources = sources.Distinct().Count() > 1;
        
        var nonBaseSources = sources.Where(s => s != "base").ToList();
        result.DominantSource = nonBaseSources.Any() ? nonBaseSources.GroupBy(s => s).OrderByDescending(g => g.Count()).First().Key : "base";

        double manualRatio = sources.Count(s => s == "manual") / 4.0;
        double jitEnRatio = sources.Count(s => s == "jit_en") / 4.0;
        double jitViRatio = sources.Count(s => s == "jit_vi") / 4.0;

        bool outdatedUsed = false;
        foreach(var kvp in fieldSources)
        {
            var t = translations.FirstOrDefault(tr => tr.translationSource == kvp.Value || (tr.mode == "partial" && kvp.Value == "manual" && tr.lang_code == lang));
            if (t != null && t.metadata.isOutdated) outdatedUsed = true;
        }
        result.UsedOutdated = outdatedUsed;

        double confidence = (1.0 * manualRatio) + (0.75 * jitEnRatio) + (0.6 * jitViRatio);
        if (outdatedUsed) confidence -= 0.2;
        
        result.ConfidenceScore = Math.Clamp(confidence, 0, 1);
        result.IsFallback = result.UsedJitEn || result.UsedJitVi || result.UsedOutdated || sources.Contains("base");
        result.ShowBadgeAutoTranslated = result.UsedJitEn || result.UsedJitVi;
        result.ShowBadgeOutdated = result.UsedOutdated;

        // 10. FINAL LOG COMPLETENESS
        _logger.LogInformation("TRANSLATION_RESOLVED | traceId: {TraceId} | poiCode: {Code} | lang: {Lang} | source: {Source} | confidence: {Conf:F2} | mixed: {Mixed} | offline: {Offline}",
            traceId, poi.Code, lang, result.DominantSource, result.ConfidenceScore, result.UsedMixedSources, isOffline);
    }

    private void LogFieldResolution(string field, string source, string reason, string traceId)
    {
        _logger.LogInformation("TRANSLATION_FIELD_RESOLVED | traceId: {TraceId} | field: {Field} | selected: {Source} | decisionReason: {Reason}",
            traceId, field, source, reason);
    }

    private ResolvedPoiContent CreateBaseResponse(PoiDto poi, string lang, string traceId)
    {
        return new ResolvedPoiContent
        {
            Name = poi.Name,
            Summary = poi.Summary,
            NarrationShort = poi.NarrationShort,
            NarrationLong = poi.NarrationLong,
            SourceType = "base",
            IsFallback = true,
            ConfidenceScore = 1.0,
            DominantSource = "base"
        };
    }

    private ResolvedPoiContent MapFromTranslation(PoiTranslationDto t)
    {
        return new ResolvedPoiContent { Name = t.content.name, Summary = t.content.summary, NarrationShort = t.content.narrationShort, NarrationLong = t.content.narrationLong, SourceType = t.translationSource, IsFallback = t.metadata.isOutdated, ConfidenceScore = t.metadata.isOutdated ? Math.Max(0, t.metadata.confidenceScore - 0.2) : t.metadata.confidenceScore, UsedManual = t.translationSource == "manual", UsedJitEn = t.translationSource == "jit_en", UsedJitVi = t.translationSource == "jit_vi", UsedOutdated = t.metadata.isOutdated, DominantSource = t.translationSource, ShowBadgeAutoTranslated = t.translationSource.StartsWith("jit_"), ShowBadgeOutdated = t.metadata.isOutdated };
    }

    private string NormalizeLang(string? lang) => string.IsNullOrWhiteSpace(lang) ? "vi" : lang.Trim().ToLowerInvariant();
}
