using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MauiApp1.ApplicationContracts.Repositories;
using MauiApp1.Models;
using MauiApp1.Models.Entities;
using Microsoft.Extensions.Logging;
using SQLite;

namespace MauiApp1.Services;

public class PoiDatabase : IPoiQueryRepository, IPoiCommandRepository, ITranslationRepository, IZoneAccessRepository, IZoneResolverRepository
{
    private readonly SQLiteAsyncConnection _db;
    private readonly ILogger<PoiDatabase> _logger;
    private bool _inited;

    public PoiDatabase(ILogger<PoiDatabase> logger)
    {
        _logger = logger;
        var path = Path.Combine(FileSystem.AppDataDirectory, "pois.db");
        _db = new SQLiteAsyncConnection(path);
    }

    public async Task InitAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (_inited) return;

        await _db.CreateTableAsync<Poi>().ConfigureAwait(false);
        await _db.CreateTableAsync<PoiTranslationCacheEntry>().ConfigureAwait(false);
        await _db.CreateTableAsync<ZonePurchase>().ConfigureAwait(false);
        await _db.CreateTableAsync<ZoneDownload>().ConfigureAwait(false);
        await _db.CreateTableAsync<DownloadedAudio>().ConfigureAwait(false);
        await _db.CreateTableAsync<SyncQueueEntry>().ConfigureAwait(false);
        await _db.CreateTableAsync<ZonePoiMapping>().ConfigureAwait(false);

        // Ensure indices
        await _db.ExecuteAsync("CREATE INDEX IF NOT EXISTS IX_pois_Code ON pois(Code)").ConfigureAwait(false);
        await _db.ExecuteAsync("CREATE UNIQUE INDEX IF NOT EXISTS IX_zone_purchases_user_zone ON zone_purchases(UserId, ZoneId)").ConfigureAwait(false);
        await _db.ExecuteAsync("CREATE UNIQUE INDEX IF NOT EXISTS IX_downloaded_audio_poi_lang ON downloaded_audio(PoiCode, Lang)").ConfigureAwait(false);
        await _db.ExecuteAsync("CREATE INDEX IF NOT EXISTS IX_sync_queue_entity ON sync_queue(EntityType)").ConfigureAwait(false);

        _inited = true;
    }

    Task IZoneAccessRepository.InitializeAsync(CancellationToken ct) => InitAsync(ct);

    // ── IZoneAccessRepository Implementation ───────────────────────────────

    public async Task SavePurchaseAtomicAsync(ZonePurchase purchase, SyncQueueEntry syncEntry, CancellationToken ct = default)
    {
        await _db.RunInTransactionAsync(tran =>
        {
            // 1. Manual Conflict Handling instead of InsertOrReplace
            var existing = tran.Table<ZonePurchase>()
                .Where(p => p.UserId == purchase.UserId && p.ZoneId == purchase.ZoneId)
                .FirstOrDefault();

            if (existing == null)
            {
                tran.Insert(purchase);
            }
            else
            {
                // Preserve ServerVerified and original PurchasedAt if already set
                if (existing.ServerVerified == 0)
                {
                    existing.Source = purchase.Source;
                    existing.IsSynced = 0;
                    tran.Update(existing);
                }
            }

            // 2. Add to Sync Queue
            tran.Insert(syncEntry);
        }).ConfigureAwait(false);
    }

    public async Task<ZonePurchase?> GetPurchaseRecordAsync(string userId, string zoneId, CancellationToken ct = default)
    {
        return await _db.Table<ZonePurchase>()
            .Where(p => p.UserId == userId && p.ZoneId == zoneId)
            .FirstOrDefaultAsync().ConfigureAwait(false);
    }

    public async Task<List<string>> GetPurchasedZonesAsync(string userId, CancellationToken ct = default)
    {
        var list = await _db.Table<ZonePurchase>()
            .Where(zp => zp.UserId == userId)
            .ToListAsync().ConfigureAwait(false);
        return list.Select(l => l.ZoneId).ToList();
    }

    public async Task MarkAsSyncedAsync(string purchaseId, CancellationToken ct = default)
    {
        var purchase = await _db.Table<ZonePurchase>().Where(p => p.Id == purchaseId).FirstOrDefaultAsync().ConfigureAwait(false);
        if (purchase != null)
        {
            purchase.IsSynced = 1;
            purchase.ServerVerified = 1;
            await _db.UpdateAsync(purchase).ConfigureAwait(false);
        }
    }

    public async Task MarkAsUnsyncedAsync(string purchaseId, CancellationToken ct = default)
    {
        var p = await _db.Table<ZonePurchase>().Where(x => x.Id == purchaseId).FirstOrDefaultAsync().ConfigureAwait(false);
        if (p != null)
        {
            p.IsSynced = 0;
            p.ServerVerified = 0;
            await _db.UpdateAsync(p).ConfigureAwait(false);
        }
    }

    public async Task UpsertServerPurchaseAsync(string userId, string zoneId, CancellationToken ct = default)
    {
        var existing = await _db.Table<ZonePurchase>()
            .Where(p => p.UserId == userId && p.ZoneId == zoneId)
            .FirstOrDefaultAsync().ConfigureAwait(false);

        if (existing == null)
        {
            await _db.InsertAsync(new ZonePurchase
            {
                Id = Guid.NewGuid().ToString(),
                UserId = userId,
                ZoneId = zoneId,
                PurchasedAt = DateTime.UtcNow.ToString("O"),
                Source = "ServerSync",
                IsSynced = 1,
                ServerVerified = 1
            }).ConfigureAwait(false);
        }
        else
        {
            // Server ALWAYS wins
            existing.IsSynced = 1;
            existing.ServerVerified = 1;
            await _db.UpdateAsync(existing).ConfigureAwait(false);
        }
    }

    public async Task RemovePurchaseAsync(string userId, string zoneId, CancellationToken ct = default)
    {
        var existing = await _db.Table<ZonePurchase>()
            .Where(p => p.UserId == userId && p.ZoneId == zoneId)
            .FirstOrDefaultAsync().ConfigureAwait(false);
        if (existing != null)
        {
            await _db.DeleteAsync(existing).ConfigureAwait(false);
        }
    }

    public Task SaveDownloadAsync(string zoneId, bool isComplete, CancellationToken ct = default)
    {
        var dl = new ZoneDownload
        {
            Id = zoneId,
            ZoneId = zoneId,
            DownloadedAt = DateTime.UtcNow.ToString("O"),
            IsComplete = isComplete ? 1 : 0
        };
        return _db.InsertOrReplaceAsync(dl);
    }

    public async Task<bool> IsZoneDownloadedAsync(string zoneId, CancellationToken ct = default)
    {
        var dl = await _db.Table<ZoneDownload>().Where(d => d.ZoneId == zoneId).FirstOrDefaultAsync().ConfigureAwait(false);
        return dl?.IsComplete == 1;
    }

    public Task UpsertDownloadedAudioAsync(DownloadedAudio audio, CancellationToken ct = default)
    {
        return _db.InsertOrReplaceAsync(audio);
    }

    public Task<DownloadedAudio?> GetDownloadedAudioAsync(string poiCode, string lang, CancellationToken ct = default)
    {
        var normalizedCode = poiCode.Trim().ToUpperInvariant();
        var normalizedLang = lang.Trim().ToLowerInvariant();
        return _db.Table<DownloadedAudio>()
            .Where(x => x.PoiCode == normalizedCode && x.Lang == normalizedLang)
            .FirstOrDefaultAsync()
            .ContinueWith(t => (DownloadedAudio?)t.Result, ct);
    }

    public Task<List<DownloadedAudio>> GetDownloadedAudioByZoneAsync(string zoneId, CancellationToken ct = default)
    {
        var normalized = zoneId.Trim().ToUpperInvariant();
        return _db.Table<DownloadedAudio>()
            .Where(x => x.ZoneId == normalized)
            .ToListAsync();
    }

    public Task<List<DownloadedAudio>> GetAllDownloadedAudioAsync(CancellationToken ct = default)
    {
        return _db.Table<DownloadedAudio>().ToListAsync();
    }

    public async Task DeleteDownloadedAudioByZoneAsync(string zoneId, CancellationToken ct = default)
    {
        var normalized = zoneId.Trim().ToUpperInvariant();
        var rows = await _db.Table<DownloadedAudio>().Where(x => x.ZoneId == normalized).ToListAsync().ConfigureAwait(false);
        foreach (var row in rows)
            await _db.DeleteAsync(row).ConfigureAwait(false);
    }

    public async Task DeleteDownloadedAudioByPoiAsync(string poiCode, string lang, CancellationToken ct = default)
    {
        var normalizedCode = poiCode.Trim().ToUpperInvariant();
        var normalizedLang = lang.Trim().ToLowerInvariant();
        var row = await _db.Table<DownloadedAudio>()
            .Where(x => x.PoiCode == normalizedCode && x.Lang == normalizedLang)
            .FirstOrDefaultAsync()
            .ConfigureAwait(false);
        if (row != null)
            await _db.DeleteAsync(row).ConfigureAwait(false);
    }

    public Task<List<ZonePurchase>> GetUnsyncedPurchasesAsync(string userId, CancellationToken ct = default)
    {
        return _db.Table<ZonePurchase>()
            .Where(p => p.UserId == userId && p.IsSynced == 0)
            .ToListAsync();
    }

    public Task<List<SyncQueueEntry>> GetSyncQueueEntriesAsync(int maxItems, CancellationToken ct = default)
    {
        return _db.Table<SyncQueueEntry>()
            .OrderBy(e => e.CreatedAt)
            .Take(maxItems)
            .ToListAsync();
    }

    public async Task IncrementRetryAsync(string entryId, CancellationToken ct = default)
    {
        var entry = await _db.Table<SyncQueueEntry>().Where(e => e.Id == entryId).FirstOrDefaultAsync().ConfigureAwait(false);
        if (entry != null)
        {
            entry.RetryCount++;
            await _db.UpdateAsync(entry).ConfigureAwait(false);
        }
    }

    public Task RemoveSyncQueueEntryAsync(string entryId, CancellationToken ct = default)
    {
        return _db.DeleteAsync<SyncQueueEntry>(entryId);
    }

    // ── IZoneResolverRepository Implementation ───────────────────────────────

    public async Task<ZonePoiMapping?> GetZoneMappingAsync(string poiCode, CancellationToken ct = default)
    {
        var norm = poiCode.Trim().ToUpperInvariant();
        return await _db.Table<ZonePoiMapping>()
            .Where(m => m.PoiCode == norm)
            .FirstOrDefaultAsync()
            .ConfigureAwait(false);
    }

    public Task UpsertZoneMappingAsync(ZonePoiMapping mapping, CancellationToken ct = default)
    {
        mapping.PoiCode = mapping.PoiCode.Trim().ToUpperInvariant();
        mapping.ZoneCode = mapping.ZoneCode?.Trim().ToUpperInvariant();
        mapping.UpdatedAt = DateTime.UtcNow;
        return _db.InsertOrReplaceAsync(mapping);
    }

    // ── Rest of PoiDatabase ──────────────────────────────────────────────────

    public Task<int> GetCountAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return _db.Table<Poi>().CountAsync();
    }

    // Changed: DB now stores exactly 1 core row per POI. No language filtering in SQL.
    public Task<List<Poi>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return _db.Table<Poi>()
              .OrderByDescending(p => p.Priority)
              .ToListAsync();
    }

    public async Task<Poi?> GetByIdAsync(string id, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return await _db.Table<Poi>()
            .Where(p => p.Id == id)
            .FirstOrDefaultAsync();
    }

    public Task<int> InsertAsync(Poi poi, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return _db.InsertAsync(poi);
    }

    public Task<int> UpdateAsync(Poi poi, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return _db.UpdateAsync(poi);
    }

    public Task<int> InsertManyAsync(IEnumerable<Poi> pois, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return _db.InsertAllAsync(pois);
    }

    public async Task UpsertAsync(Poi poi, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var existing = await GetByIdAsync(poi.Id, cancellationToken).ConfigureAwait(false);

        if (existing == null)
        {
            await _db.InsertAsync(poi);
            return;
        }

        await _db.UpdateAsync(poi);
    }

    public async Task UpsertManyAsync(IEnumerable<Poi> pois, CancellationToken cancellationToken = default)
    {
        foreach (var poi in pois)
        {
            cancellationToken.ThrowIfCancellationRequested();
            await UpsertAsync(poi, cancellationToken).ConfigureAwait(false);
        }
    }

    public async Task<Poi?> GetByCodeAsync(string code, string? lang = null, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (string.IsNullOrWhiteSpace(code)) return null;
        code = code.Trim();

        if (!string.IsNullOrWhiteSpace(lang))
        {
            _logger.LogWarning(
                "[TranslationWarning] GetByCodeAsync ignores Lang parameter for code-only lookup | Code={Code} | Lang={Lang}",
                code,
                lang);
        }

        return await _db.Table<Poi>()
            .Where(p => p.Code == code)
            .FirstOrDefaultAsync();
    }

    public Task<Poi?> GetAnyLanguageByCodeAsync(string code, CancellationToken cancellationToken = default)
        => GetByCodeAsync(code, null, cancellationToken);

    public async Task<Poi?> GetExactByCodeAndLanguageAsync(
        string code,
        string languageCode,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(languageCode))
            return null;

        var normCode = code.Trim().ToUpperInvariant();
        var normLang = languageCode.Trim().ToLowerInvariant();

        var matches = await _db.Table<Poi>()
            .Where(p => p.Code == normCode && p.LanguageCode == normLang)
            .Take(2)
            .ToListAsync()
            .ConfigureAwait(false);

        if (matches.Count > 1)
        {
            _logger.LogWarning(
                "[TranslationWarning] Multiple POI rows for same code and language | Code={Code} | Lang={Lang} | Count={Count}",
                normCode,
                normLang,
                matches.Count);
        }

        return matches.Count == 0 ? null : matches[0];
    }

    public async Task<PoiTranslationCacheEntry?> GetTranslationCacheAsync(
        string code,
        string languageCode,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var key = PoiTranslationCacheEntry.MakeKey(code, languageCode, 1, 1, "partial");
        return await _db.Table<PoiTranslationCacheEntry>()
            .Where(e => e.Key == key)
            .FirstOrDefaultAsync().ConfigureAwait(false);
    }

    public async Task UpsertTranslationCacheAsync(PoiTranslationCacheEntry entry, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var existing = await _db.Table<PoiTranslationCacheEntry>()
            .Where(e => e.Key == entry.Key)
            .FirstOrDefaultAsync();

        if (existing == null)
            await _db.InsertAsync(entry);
        else
            await _db.UpdateAsync(entry);
    }

    public async Task<List<Poi>> GetNearbyAsync(double latitude, double longitude, double radiusInMeters, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var all = await GetAllAsync(cancellationToken);

        var currentLoc = new Microsoft.Maui.Devices.Sensors.Location(latitude, longitude);
        return all.Where(p =>
            Microsoft.Maui.Devices.Sensors.Location.CalculateDistance(
                currentLoc,
                new Microsoft.Maui.Devices.Sensors.Location(p.Latitude, p.Longitude),
                Microsoft.Maui.Devices.Sensors.DistanceUnits.Kilometers) <= radiusInMeters / 1000.0
        ).ToList();
    }
}
