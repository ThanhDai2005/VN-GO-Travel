namespace MauiApp1.Services;

// PendingDeepLinkStore: single pending VIEW intent URI from MainActivity (see docs/QR_MODULE.md).
// Warm intents are consumed via DeepLinkCoordinator; cold-start auto-consume remains deferred.
public class PendingDeepLinkStore
{
    private PendingItem? _pending;
    private readonly object _lock = new();

    private class PendingItem
    {
        public string Raw { get; set; } = string.Empty;
        public bool IsWarm { get; set; }
        public DateTimeOffset Timestamp { get; set; }
    }

    // Store pending link with a flag indicating whether it originated from a warm intent
    public void SetPendingLink(string rawLink, bool isWarm = false)
    {
        if (string.IsNullOrWhiteSpace(rawLink))
            return;

        lock (_lock)
        {
            _pending = new PendingItem { Raw = rawLink, IsWarm = isWarm, Timestamp = DateTimeOffset.UtcNow };
        }
    }

    // Take pending link regardless of warm/cold (clears the store)
    public string? TakePendingLink()
    {
        lock (_lock)
        {
            var tmp = _pending?.Raw;
            _pending = null;
            return tmp;
        }
    }

    // Take pending link only if it was marked as warm (clears if returned)
    public string? TakePendingLinkIfWarm()
    {
        lock (_lock)
        {
            if (_pending == null)
                return null;

            if (_pending.IsWarm)
            {
                var raw = _pending.Raw;
                _pending = null;
                return raw;
            }

            return null;
        }
    }

    public bool HasPendingLink()
    {
        lock (_lock)
        {
            return _pending != null && !string.IsNullOrEmpty(_pending.Raw);
        }
    }

    public bool HasWarmPendingLink()
    {
        lock (_lock)
        {
            return _pending != null && _pending.IsWarm && !string.IsNullOrEmpty(_pending.Raw);
        }
    }
}
