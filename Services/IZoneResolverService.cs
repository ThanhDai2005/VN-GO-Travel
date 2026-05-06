using System.Threading;
using System.Threading.Tasks;

namespace MauiApp1.Services;

public interface IZoneResolverService
{
    Task<string?> ResolveZoneAsync(string poiCode, bool forceRefresh = false, CancellationToken ct = default);
}
