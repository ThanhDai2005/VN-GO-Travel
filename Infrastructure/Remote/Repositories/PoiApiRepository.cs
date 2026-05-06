using MauiApp1.ApplicationContracts.Repositories;
using PoiDto = MauiApp1.Infrastructure.Remote.Dtos.PoiDto;
using MauiApp1.Infrastructure.Remote.Dtos;
using MauiApp1.Models;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace MauiApp1.Infrastructure.Remote.Repositories;

public class PoiApiRepository : IPoiQueryRepository
{
    private readonly IApiClient _apiClient;

    public PoiApiRepository(IApiClient apiClient)
    {
        _apiClient = apiClient;
    }

    public Task InitAsync(CancellationToken cancellationToken = default)
    {
        // No-op for remote API
        return Task.CompletedTask;
    }

    public async Task<int> GetCountAsync(CancellationToken cancellationToken = default)
    {
        var count = await _apiClient.GetAsync<int>("pois/count", cancellationToken);
        return count;
    }

    public async Task<List<Poi>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        var dtos = await _apiClient.GetAsync<List<PoiDto>>("pois", cancellationToken);
        return dtos?.Select(MapToDomain).ToList() ?? new List<Poi>();
    }

    public async Task<Poi?> GetByIdAsync(string id, CancellationToken cancellationToken = default)
    {
        var dto = await _apiClient.GetAsync<PoiDto>($"pois/{id}", cancellationToken);
        return dto == null ? null : MapToDomain(dto);
    }

    public async Task<Poi?> GetByCodeAsync(string code, string? lang = null, CancellationToken cancellationToken = default)
    {
        var endpoint = string.IsNullOrEmpty(lang) ? $"pois/code/{code}" : $"pois/code/{code}?lang={lang}";
        var dto = await _apiClient.GetAsync<PoiDto>(endpoint, cancellationToken);
        return dto == null ? null : MapToDomain(dto);
    }

    public Task<Poi?> GetAnyLanguageByCodeAsync(string code, CancellationToken cancellationToken = default)
        => GetByCodeAsync(code, null, cancellationToken);

    public Task<Poi?> GetExactByCodeAndLanguageAsync(string code, string languageCode, CancellationToken cancellationToken = default)
        => GetByCodeAsync(code, languageCode, cancellationToken);

    public async Task<List<Poi>> GetNearbyAsync(double latitude, double longitude, double radius, CancellationToken cancellationToken = default)
    {
        var dtos = await _apiClient.GetAsync<List<PoiDto>>($"pois/nearby?lat={latitude}&lng={longitude}&radius={radius}", cancellationToken);
        return dtos?.Select(MapToDomain).ToList() ?? new List<Poi>();
    }

    private Poi MapToDomain(PoiDto dto)
    {
        var poi = new Poi
        {
            Id = dto.Id,
            Code = dto.Code,
            Latitude = dto.Lat,
            Longitude = dto.Lng,
            Priority = dto.Priority,
            Radius = dto.Radius,
            ZoneCode = dto.ZoneCode,
            ZoneName = dto.ZoneName,
            HasAccess = dto.AccessStatus?.Allowed ?? false,
            Version = dto.Version,
            Translations = dto.Translations?.Select(t => new MauiApp1.Models.PoiTranslationDto
            {
                translationSource = t.translationSource,
                content = t.content != null ? new MauiApp1.Models.PoiTranslationContentDto
                {
                    name = t.content.name,
                    summary = t.content.summary,
                    narrationShort = t.content.narrationShort,
                    narrationLong = t.content.narrationLong
                } : null
            }).ToList()
        };

        if (!string.IsNullOrEmpty(dto.Name) || !string.IsNullOrEmpty(dto.Summary))
        {
            poi.Localization = new PoiLocalization
            {
                Code = dto.Code,
                LanguageCode = dto.LanguageCode,
                Name = dto.Name,
                Summary = dto.Summary,
                NarrationShort = dto.NarrationShort,
                NarrationLong = dto.NarrationLong
            };
            poi.UsedLanguage = dto.LanguageCode;
            poi.RequestedLanguage = dto.LanguageCode;
        }

        return poi;
    }
}
