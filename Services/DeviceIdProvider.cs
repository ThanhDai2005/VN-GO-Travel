namespace MauiApp1.Services;

public sealed class DeviceIdProvider : IDeviceIdProvider
{
    private const string StorageKey = "vngo_device_id";
    private readonly SemaphoreSlim _gate = new(1, 1);
    private string? _cached;

    public async Task<string> GetOrCreateDeviceIdAsync(CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrEmpty(_cached))
            return _cached;

        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (!string.IsNullOrEmpty(_cached))
                return _cached;

            var existing = await SecureStorage.Default.GetAsync(StorageKey).ConfigureAwait(false);
            if (!string.IsNullOrWhiteSpace(existing))
            {
                _cached = existing;
                return _cached;
            }

            var id = Guid.NewGuid().ToString("N");
            await SecureStorage.Default.SetAsync(StorageKey, id).ConfigureAwait(false);
            _cached = id;
            return _cached;
        }
        finally
        {
            _gate.Release();
        }
    }
}
