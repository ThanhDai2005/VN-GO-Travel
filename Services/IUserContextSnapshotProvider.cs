using MauiApp1.Models;

namespace MauiApp1.Services;

public interface IUserContextSnapshotProvider
{
    Task<UserContext> GetAsync(CancellationToken cancellationToken = default);
}
