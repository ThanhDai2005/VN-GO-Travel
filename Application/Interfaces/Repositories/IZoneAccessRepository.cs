using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MauiApp1.Models.Entities;

namespace MauiApp1.ApplicationContracts.Repositories;

public interface IZoneAccessRepository
{
    Task InitializeAsync(CancellationToken ct = default);
    
    // --- Atomic / Transactional ---
    Task SavePurchaseAtomicAsync(ZonePurchase purchase, SyncQueueEntry syncEntry, CancellationToken ct = default);
    
    // --- Retrieval ---
    Task<ZonePurchase?> GetPurchaseRecordAsync(string userId, string zoneId, CancellationToken ct = default);
    Task<List<string>> GetPurchasedZonesAsync(string userId, CancellationToken ct = default);
    Task<List<ZonePurchase>> GetUnsyncedPurchasesAsync(string userId, CancellationToken ct = default);
    
    // --- Updates ---
    Task MarkAsSyncedAsync(string purchaseId, CancellationToken ct = default);
    Task MarkAsUnsyncedAsync(string purchaseId, CancellationToken ct = default);
    Task UpsertServerPurchaseAsync(string userId, string zoneId, CancellationToken ct = default);
    Task RemovePurchaseAsync(string userId, string zoneId, CancellationToken ct = default);
    
    // --- Downloads ---
    Task SaveDownloadAsync(string zoneId, bool isComplete, CancellationToken ct = default);
    Task<bool> IsZoneDownloadedAsync(string zoneId, CancellationToken ct = default);
    Task UpsertDownloadedAudioAsync(DownloadedAudio audio, CancellationToken ct = default);
    Task<DownloadedAudio?> GetDownloadedAudioAsync(string poiCode, string lang, CancellationToken ct = default);
    Task<List<DownloadedAudio>> GetDownloadedAudioByZoneAsync(string zoneId, CancellationToken ct = default);
    Task<List<DownloadedAudio>> GetAllDownloadedAudioAsync(CancellationToken ct = default);
    Task DeleteDownloadedAudioByZoneAsync(string zoneId, CancellationToken ct = default);
    Task DeleteDownloadedAudioByPoiAsync(string poiCode, string lang, CancellationToken ct = default);
    
    // --- Sync Queue ---
    Task<List<SyncQueueEntry>> GetSyncQueueEntriesAsync(int maxItems, CancellationToken ct = default);
    Task IncrementRetryAsync(string entryId, CancellationToken ct = default);
    Task RemoveSyncQueueEntryAsync(string entryId, CancellationToken ct = default);
}
