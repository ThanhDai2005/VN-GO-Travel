using System.Threading;
using System.Threading.Tasks;
using MauiApp1.Models.Entities;

namespace MauiApp1.ApplicationContracts.Repositories;

public interface IZoneResolverRepository
{
    Task<ZonePoiMapping?> GetZoneMappingAsync(string poiCode, CancellationToken ct = default);
    Task UpsertZoneMappingAsync(ZonePoiMapping mapping, CancellationToken ct = default);
}
