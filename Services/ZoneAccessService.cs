using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace MauiApp1.Services;

public sealed class ZoneAccessService : IZoneAccessService
{
    public event EventHandler<string>? AccessRevoked;

    private const string SyncEntityType = "ZonePurchase";
    private const int MaxRetryCount = 5;
    
    private readonly IZoneAccessRepository _repository;
    private readonly AuthService _auth;
    private readonly ApiService _api;
    private readonly HashSet<string> _cache = new(StringComparer.OrdinalIgnoreCase);
    private bool _initialized;
    private readonly SemaphoreSlim _syncLock = new(1, 1);

    private readonly ILoggerService _loggerService;

    public ZoneAccessService(IZoneAccessRepository repository, AuthService auth, ApiService api, ILoggerService loggerService)
    {
        _repository = repository;
        _auth = auth;
        _api = api;
        _loggerService = loggerService;

        // FIX 5: Invalidate on session change
        _auth.SessionChanged += (s, e) => Invalidate();
        _auth.PropertyChanged += (s, e) =>
        {
            if (e.PropertyName == nameof(AuthService.IsAuthenticated))
                Invalidate();
        };
    }

    private void Invalidate()
    {
        _initialized = false;
        _cache.Clear();
    }

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        if (_initialized) return;
        await _repository.InitializeAsync(cancellationToken).ConfigureAwait(false);
        await LoadCacheAsync(cancellationToken).ConfigureAwait(false);
        _initialized = true;
    }

    public bool HasAccess(string zoneId)
    {
        if (string.IsNullOrWhiteSpace(zoneId)) return false;
        return _cache.Contains(zoneId.Trim().ToUpperInvariant());
    }

    public async Task<bool> HasAccessAsync(string zoneId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(zoneId)) return false;
        await InitializeAsync(cancellationToken).ConfigureAwait(false);

        var normalizedZone = zoneId.Trim().ToUpperInvariant();
        if (_cache.Contains(normalizedZone))
            return true;

        var userId = _auth.UserId;
        if (string.IsNullOrWhiteSpace(userId))
            return false;

        var record = await _repository.GetPurchaseRecordAsync(userId, normalizedZone, cancellationToken).ConfigureAwait(false);
        if (record != null)
        {
            _cache.Add(normalizedZone);
            return true;
        }

        return false;
    }

    public async Task SetAccessAsync(string zoneId, bool hasAccess, string source = "Manual", CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(zoneId)) return;
        await InitializeAsync(cancellationToken).ConfigureAwait(false);

        var normalizedZone = zoneId.Trim().ToUpperInvariant();
        if (!hasAccess) return;

        var userId = _auth.UserId;
        if (string.IsNullOrWhiteSpace(userId))
            throw new InvalidOperationException("User must be authenticated to purchase a zone.");

        var purchase = new ZonePurchase
        {
            Id = Guid.NewGuid().ToString(),
            UserId = userId,
            ZoneId = normalizedZone,
            PurchasedAt = DateTime.UtcNow.ToString("O"),
            Source = source,
            IsSynced = 0,
            ServerVerified = 0
        };

        var syncEntry = new SyncQueueEntry
        {
            Id = Guid.NewGuid().ToString(),
            EntityType = SyncEntityType,
            Payload = JsonSerializer.Serialize(new { userId, zoneId = normalizedZone, source }),
            CreatedAt = DateTime.UtcNow.ToString("O"),
            RetryCount = 0
        };

        await _repository.SavePurchaseAtomicAsync(purchase, syncEntry, cancellationToken).ConfigureAwait(false);

        _cache.Add(normalizedZone);

        _ = Task.Run(() => SyncWithServerAsync(CancellationToken.None));
    }

    public async Task<List<string>> GetAccessibleZonesAsync(CancellationToken cancellationToken = default)
    {
        await InitializeAsync(cancellationToken).ConfigureAwait(false);

        var userId = _auth.UserId;
        if (string.IsNullOrWhiteSpace(userId))
            return new List<string>();

        var zones = await _repository.GetPurchasedZonesAsync(userId, cancellationToken).ConfigureAwait(false);
        foreach (var zone in zones)
            _cache.Add(zone);

        return zones;
    }

    public async Task EnsureAccessAsync(string zoneId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(zoneId)) return;
        var has = await HasAccessAsync(zoneId, cancellationToken).ConfigureAwait(false);
        if (!has)
        {
            throw new UnauthorizedAccessException($"[SECURITY] Access denied to zone: {zoneId}");
        }
    }

    public async Task SyncWithServerAsync(CancellationToken cancellationToken = default)
    {
        await InitializeAsync(cancellationToken).ConfigureAwait(false);

        var userId = _auth.UserId;
        if (string.IsNullOrWhiteSpace(userId)) return;

        if (!await _syncLock.WaitAsync(0, cancellationToken).ConfigureAwait(false))
            return;

        try
        {
            await PushUnsyncedPurchasesAsync(userId, cancellationToken).ConfigureAwait(false);
            await PullServerPurchasesAsync(userId, cancellationToken).ConfigureAwait(false);
            await ProcessSyncQueueAsync(userId, cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            _syncLock.Release();
        }
    }

    private async Task LoadCacheAsync(CancellationToken cancellationToken)
    {
        _cache.Clear();
        var userId = _auth.UserId;
        if (string.IsNullOrWhiteSpace(userId)) return;

        var zones = await _repository.GetPurchasedZonesAsync(userId, cancellationToken).ConfigureAwait(false);
        foreach (var zone in zones)
            _cache.Add(zone);
    }

    private async Task PushUnsyncedPurchasesAsync(string userId, CancellationToken cancellationToken)
    {
        var unsynced = await _repository.GetUnsyncedPurchasesAsync(userId, cancellationToken).ConfigureAwait(false);
        foreach (var purchase in unsynced)
        {
            await TrySyncPurchaseAsync(userId, purchase.ZoneId, purchase.Id, cancellationToken).ConfigureAwait(false);
        }
    }

    private async Task PullServerPurchasesAsync(string userId, CancellationToken cancellationToken)
    {
        try
        {
            using var response = await _api.GetAsync("auth/me", cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode) return;

            var envelope = await _api.ReadFromJsonAsync<MeApiEnvelope>(response, cancellationToken).ConfigureAwait(false);
            var serverZones = envelope?.Data?.PurchasedZones ?? new List<string>();

            foreach (var zoneId in serverZones)
            {
                if (string.IsNullOrWhiteSpace(zoneId)) continue;
                await _repository.UpsertServerPurchaseAsync(userId, zoneId.Trim().ToUpperInvariant(), cancellationToken).ConfigureAwait(false);
                _cache.Add(zoneId.Trim().ToUpperInvariant());
            }
        }
        catch { }
    }

    private async Task ProcessSyncQueueAsync(string userId, CancellationToken cancellationToken)
    {
        var entries = await _repository.GetSyncQueueEntriesAsync(25, cancellationToken).ConfigureAwait(false);
        foreach (var entry in entries)
        {
            if (entry.RetryCount >= MaxRetryCount)
            {
                // REVOCATION LOGIC (FIX TASK 2)
                var payloadJson = JsonSerializer.Deserialize<Dictionary<string, string>>(entry.Payload);
                if (payloadJson != null && payloadJson.TryGetValue("zoneId", out var zid))
                {
                    await _repository.RemovePurchaseAsync(userId, zid, cancellationToken).ConfigureAwait(false);
                    Invalidate(); // Force cache re-load or clear
                    AccessRevoked?.Invoke(this, zid);
                }

                await _repository.RemoveSyncQueueEntryAsync(entry.Id, cancellationToken).ConfigureAwait(false);
                continue;
            }

            if (!string.Equals(entry.EntityType, SyncEntityType, StringComparison.OrdinalIgnoreCase))
                continue;

            var payload = JsonSerializer.Deserialize<Dictionary<string, string>>(entry.Payload);
            if (payload == null || !payload.TryGetValue("zoneId", out var zoneId))
            {
                await _repository.RemoveSyncQueueEntryAsync(entry.Id, cancellationToken).ConfigureAwait(false);
                continue;
            }

            var purchase = await _repository.GetPurchaseRecordAsync(userId, zoneId, cancellationToken).ConfigureAwait(false);
            if (purchase == null)
            {
                await _repository.RemoveSyncQueueEntryAsync(entry.Id, cancellationToken).ConfigureAwait(false);
                continue;
            }

            var synced = await TrySyncPurchaseAsync(userId, zoneId, purchase.Id, cancellationToken).ConfigureAwait(false);
            if (synced)
                await _repository.RemoveSyncQueueEntryAsync(entry.Id, cancellationToken).ConfigureAwait(false);
            else
                await _repository.IncrementRetryAsync(entry.Id, cancellationToken).ConfigureAwait(false);
        }
    }

    private async Task<bool> TrySyncPurchaseAsync(string userId, string zoneId, string purchaseId, CancellationToken cancellationToken)
    {
        var record = await _repository.GetPurchaseRecordAsync(userId, zoneId, cancellationToken).ConfigureAwait(false);
        if (record?.ServerVerified == 1)
            return true;

        try
        {
            using var response = await _api.PostAsJsonAsync($"zones/{Uri.EscapeDataString(zoneId)}/purchase", new { }, cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode) return false;

            await _repository.MarkAsSyncedAsync(purchaseId, cancellationToken).ConfigureAwait(false);
            return true;
        }
        catch { return false; }
    }
}
