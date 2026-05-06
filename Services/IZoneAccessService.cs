using System.Collections.Generic;
using System.Threading.Tasks;

namespace MauiApp1.Services;

public interface IZoneAccessService
{
    event EventHandler<string>? AccessRevoked;

    Task InitializeAsync(CancellationToken ct = default);
    
    /// <summary>Synchronous check against in-memory cache.</summary>
    bool HasAccess(string zoneId);
    
    /// <summary>Asynchronous check against DB and cache.</summary>
    Task<bool> HasAccessAsync(string zoneId, CancellationToken ct = default);

    Task SetAccessAsync(string zoneId, bool hasAccess, string source = "Manual", CancellationToken ct = default);
    
    Task<List<string>> GetAccessibleZonesAsync(CancellationToken ct = default);

    Task RefreshAsync(CancellationToken ct = default);

    Task SyncWithServerAsync(CancellationToken ct = default);
    
    /// <summary>Strict enforcement: throws UnauthorizedAccessException if access is missing.</summary>
    Task EnsureAccessAsync(string zoneId, CancellationToken ct = default);
}
