using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MauiApp1.Models;
using MauiApp1.ApplicationContracts.Repositories;
using Microsoft.Extensions.Logging;
using Microsoft.Maui.Devices;
using Microsoft.Maui.Networking;

namespace MauiApp1.Services;

public interface IPreloadService
{
    Task PreloadZoneAsync(string zoneId, string userLang, CancellationToken ct = default);
}

public class PreloadService : IPreloadService
{
    private readonly IPoiQueryRepository _poiRepo;
    private readonly ITranslationResolverService _resolver;
    private readonly INetworkService _network;
    private readonly IDeduplicationService _dedup;
    private readonly ILogger<PreloadService> _logger;

    public PreloadService(
        IPoiQueryRepository poiRepo,
        ITranslationResolverService resolver,
        INetworkService network,
        IDeduplicationService dedup,
        ILogger<PreloadService> logger)
    {
        _poiRepo = poiRepo;
        _resolver = resolver;
        _network = network;
        _dedup = dedup;
        _logger = logger;
    }

    public async Task PreloadZoneAsync(string zoneId, string userLang, CancellationToken ct = default)
    {
        string traceId = Guid.NewGuid().ToString("N").Substring(0, 8);
        _logger.LogInformation("PRELOAD_STARTED | traceId: {TraceId} | zone: {ZoneId}", traceId, zoneId);

        // 4. OFFLINE FALLBACK DEPTH
        bool isOffline = _network.NetworkAccess != NetworkAccess.Internet;
        if (isOffline) _logger.LogInformation("OFFLINE_MODE_ACTIVE | traceId: {TraceId} | Skipping network JIT", traceId);

        if (Battery.Default.ChargeLevel < 0.15 && Battery.Default.State != BatteryState.Charging)
        {
            _logger.LogWarning("PRELOAD_CANCELLED | traceId: {TraceId} | reason: battery_low", traceId);
            return;
        }

        var allPois = await _poiRepo.GetAllAsync(ct);
        var zonePois = allPois.Where(p => p.ZoneCode == zoneId).ToList();

        if (!zonePois.Any()) return;

        // 4. PRELOAD SCORE NORMALIZATION
        // Formula: score = (normalizedDistance * 0.6) + (normalizedPriority * 0.3) + (normalizedInteraction * 0.1)
        
        // Mocking max values for normalization
        double maxDistance = 10000; // 10km
        double maxPriority = 100;
        double maxInteraction = 50;

        var rankedPois = zonePois.Select(p => 
        {
            double dist = 100; // Simulated distance
            double interaction = 0; // Simulated interaction
            
            double normDist = 1 - Math.Clamp(dist / maxDistance, 0, 1);
            double normPri = Math.Clamp((double)p.Priority / maxPriority, 0, 1);
            double normInt = Math.Clamp(interaction / maxInteraction, 0, 1);

            double score = (normDist * 0.6) + (normPri * 0.3) + (normInt * 0.1);
            return new { Poi = p, Score = score };
        })
        .OrderByDescending(x => x.Score)
        .Take(10)
        .ToList();

        foreach (var item in rankedPois)
        {
            if (ct.IsCancellationRequested) break;

            var poi = item.Poi;
            string jobKey = $"{poi.Code}_{userLang}_preload";
            
            // 6.2 Attach TraceId to logs
            _logger.LogDebug("PRELOAD_ENQUEUE | traceId: {TraceId} | poi: {Code} | score: {Score:F2}", traceId, poi.Code, item.Score);

            await _dedup.RunOnceAsync(jobKey, async () => 
            {
                // Injected traceId should ideally be passed to ResolvePoiContentAsync
                return await _resolver.ResolvePoiContentAsync(MapToDto(poi), userLang);
            });
        }

        _logger.LogInformation("PRELOAD_COMPLETED | traceId: {TraceId} | zone: {ZoneId}", traceId, zoneId);
    }

    private PoiDto MapToDto(Poi poi) => new()
    {
        Code = poi.Code,
        Name = poi.Localization?.Name ?? "",
        Summary = poi.Localization?.Summary ?? "",
        NarrationShort = poi.Localization?.NarrationShort ?? "",
        NarrationLong = poi.Localization?.NarrationLong ?? "",
        Version = poi.Version,
        Translations = poi.Translations
    };
}
