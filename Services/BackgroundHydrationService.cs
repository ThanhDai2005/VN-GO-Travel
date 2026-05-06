using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MauiApp1.Models;
using MauiApp1.ApplicationContracts.Repositories;
using Microsoft.Extensions.Logging;
using Microsoft.Maui.Devices;

namespace MauiApp1.Services;

public interface IBackgroundHydrationService
{
    Task StartHydrationAsync(CancellationToken ct = default);
}

public class BackgroundHydrationService : IBackgroundHydrationService
{
    private readonly IPoiQueryRepository _poiRepo;
    private readonly ITranslationResolverService _resolver;
    private readonly INetworkService _network;
    private readonly ILogger<BackgroundHydrationService> _logger;

    public BackgroundHydrationService(
        IPoiQueryRepository poiRepo,
        ITranslationResolverService resolver,
        INetworkService network,
        ILogger<BackgroundHydrationService> logger)
    {
        _poiRepo = poiRepo;
        _resolver = resolver;
        _network = network;
        _logger = logger;
    }

    public async Task StartHydrationAsync(CancellationToken ct = default)
    {
        string traceId = Guid.NewGuid().ToString("N").Substring(0, 8);
        
        // 4. Background Hydration Engine
        if (Battery.Default.ChargeLevel < 0.2 || _network.NetworkAccess != Microsoft.Maui.Networking.NetworkAccess.Internet)
        {
            return;
        }

        _logger.LogInformation("HYDRATION_STARTED | traceId: {TraceId}", traceId);

        var pois = await _poiRepo.GetAllAsync(ct);
        
        // Priority: Missing fields or low confidence
        // For simplicity, we just process a few POIs that might need updates
        var targetPois = pois.OrderBy(p => p.Priority).Take(5).ToList();

        foreach (var poi in targetPois)
        {
            if (ct.IsCancellationRequested) break;

            // Trigger resolution which will update cache/JIT if needed
            await _resolver.ResolvePoiContentAsync(MapToDto(poi), "en");
            await _resolver.ResolvePoiContentAsync(MapToDto(poi), "vi");
        }

        _logger.LogInformation("HYDRATION_COMPLETED");
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
