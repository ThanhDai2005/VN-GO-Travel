using System.Collections.Concurrent;
using System.Diagnostics;
using MauiApp1.ApplicationContracts.Repositories;
using MauiApp1.Models.Entities;

namespace MauiApp1.Services;

public sealed class ZoneResolverService : IZoneResolverService
{
    private readonly IZoneResolverRepository _repository;
    private readonly ApiService _api;
    private readonly ConcurrentDictionary<string, string> _memoryCache = new();
    private readonly ConcurrentDictionary<string, Task<string?>> _inflightRequests = new();

    public ZoneResolverService(IZoneResolverRepository repository, ApiService api)
    {
        _repository = repository;
        _api = api;
    }

    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(10);

    public async Task<string?> ResolveZoneAsync(string poiCode, bool forceRefresh = false, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(poiCode)) return null;
        var norm = poiCode.Trim().ToUpperInvariant();

        // 1. Memory Cache (Always first)
        if (!forceRefresh && _memoryCache.TryGetValue(norm, out var zoneCode))
        {
            return zoneCode;
        }

        if (forceRefresh)
        {
            _memoryCache.TryRemove(norm, out _);
        }

        // 2. Try API (Authored Truth)
        try 
        {
            var apiResult = await _inflightRequests.GetOrAdd(norm, code => FetchFromApiAsync(code, ct)).ConfigureAwait(false);
            if (!string.IsNullOrEmpty(apiResult))
                return apiResult;
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[ZoneResolver] API Resolve failed for {norm}: {ex.Message}. Falling back to SQLite.");
        }

        // 3. Fallback to SQLite (Only if API failed or offline)
        if (!forceRefresh)
        {
            var mapping = await _repository.GetZoneMappingAsync(norm, ct).ConfigureAwait(false);
            if (mapping != null && !string.IsNullOrEmpty(mapping.ZoneCode))
            {
                _memoryCache[norm] = mapping.ZoneCode;
                return mapping.ZoneCode;
            }
        }

        return null;
    }

    private async Task<string?> FetchFromApiAsync(string poiCode, CancellationToken ct)
    {
        try
        {
            Debug.WriteLine($"[ZoneResolver] Fetching zone for POI {poiCode} from API...");
            
            // ATTEMPT 1: Specialized Zone Endpoint
            using var response = await _api.GetAsync($"pois/{poiCode}/zone", ct).ConfigureAwait(false);
            
            string? zoneCode = null;
            if (response.IsSuccessStatusCode)
            {
                var result = await _api.ReadFromJsonAsync<PoiZoneResponse>(response, ct).ConfigureAwait(false);
                zoneCode = result?.Data?.ZoneCode;
            }

            // ATTEMPT 2: Fallback to Detailed POI (Bug 3 Fix)
            if (string.IsNullOrEmpty(zoneCode))
            {
                Debug.WriteLine($"[ZoneResolver] Fallback: fetching detailed POI for {poiCode}");
                using var fallbackResponse = await _api.GetAsync($"pois/{poiCode}?includeZone=true", ct).ConfigureAwait(false);
                if (fallbackResponse.IsSuccessStatusCode)
                {
                    var detailed = await _api.ReadFromJsonAsync<PoiDetailResponse>(fallbackResponse, ct).ConfigureAwait(false);
                    zoneCode = detailed?.Data?.ZoneCode;
                }
            }

            if (!string.IsNullOrEmpty(zoneCode))
            {
                // Save to SQLite
                await _repository.UpsertZoneMappingAsync(new ZonePoiMapping
                {
                    PoiCode = poiCode,
                    ZoneCode = zoneCode
                }, ct).ConfigureAwait(false);

                // Save to Memory
                _memoryCache[poiCode] = zoneCode;
            }

            return zoneCode;
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[ZoneResolver] Error resolving {poiCode}: {ex.Message}");
            return null;
        }
        finally
        {
            _inflightRequests.TryRemove(poiCode, out _);
        }
    }

    private class PoiZoneResponse
    {
        public bool Success { get; set; }
        public PoiZoneData? Data { get; set; }
    }

    private class PoiZoneData
    {
        public string? PoiCode { get; set; }
        public string? ZoneCode { get; set; }
    }

    private class PoiDetailResponse
    {
        public bool Success { get; set; }
        public PoiDetailData? Data { get; set; }
    }

    private class PoiDetailData
    {
        public string? Code { get; set; }
        public string? ZoneCode { get; set; }
    }
}
