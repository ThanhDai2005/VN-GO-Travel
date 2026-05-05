using MauiApp1.Models;

namespace MauiApp1.Services;

public sealed class UserContextSnapshotProvider : IUserContextSnapshotProvider
{
    private readonly AuthService _auth;
    private readonly IDeviceIdProvider _deviceId;

    public UserContextSnapshotProvider(AuthService auth, IDeviceIdProvider deviceId)
    {
        _auth = auth;
        _deviceId = deviceId;
    }

    public async Task<UserContext> GetAsync(CancellationToken cancellationToken = default)
    {
        var deviceId = await _deviceId.GetOrCreateDeviceIdAsync(cancellationToken).ConfigureAwait(false);

        if (!_auth.IsAuthenticated)
        {
            return new UserContext
            {
                UserType = EventUserTier.Guest,
                UserId = null,
                DeviceId = deviceId
            };
        }

        return new UserContext
        {
            UserType = EventUserTier.User,
            UserId = _auth.UserId,
            DeviceId = deviceId
        };
    }
}
