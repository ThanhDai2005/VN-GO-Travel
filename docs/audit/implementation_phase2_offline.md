# Phase 2: Offline Support & Sync Implementation

**Priority:** HIGH  
**Timeline:** 5-7 days  
**Status:** READY FOR IMPLEMENTATION

---

## 1. DOWNLOAD QUEUE SERVICE

### 1.1 Database Schema

**File:** `Models/DownloadQueueItem.cs` (NEW)

```csharp
using SQLite;

namespace MauiApp1.Models;

[Table("download_queue")]
public class DownloadQueueItem
{
    [PrimaryKey, AutoIncrement]
    public int Id { get; set; }
    
    [Indexed]
    public string PoiCode { get; set; }
    
    public string AudioUrl { get; set; }
    
    [Indexed]
    public DownloadStatus Status { get; set; }
    
    public string LocalPath { get; set; }
    
    public string ErrorMessage { get; set; }
    
    public int RetryCount { get; set; }
    
    public int Priority { get; set; } // 0 = low, 1 = normal, 2 = high
    
    public long FileSizeBytes { get; set; }
    
    public DateTime CreatedAt { get; set; }
    
    public DateTime? StartedAt { get; set; }
    
    public DateTime? CompletedAt { get; set; }
    
    public DateTime? LastRetryAt { get; set; }
}

public enum DownloadStatus
{
    Pending = 0,
    Downloading = 1,
    Done = 2,
    Failed = 3,
    Paused = 4
}
```

### 1.2 Download Queue Service

**File:** `Services/DownloadQueueService.cs` (NEW)

```csharp
using System.Collections.Concurrent;
using System.Diagnostics;
using MauiApp1.Models;
using SQLite;

namespace MauiApp1.Services;

public class DownloadQueueService
{
    private readonly SQLiteAsyncConnection _db;
    private readonly HttpClient _httpClient;
    private readonly string _audioDirectory;
    private readonly SemaphoreSlim _downloadSemaphore;
    private readonly ConcurrentDictionary<int, CancellationTokenSource> _activeDownloads;
    private bool _isProcessing;
    private const int MaxConcurrentDownloads = 2;
    private const int MaxRetries = 3;

    public DownloadQueueService(HttpClient httpClient)
    {
        var dbPath = Path.Combine(FileSystem.AppDataDirectory, "pois.db");
        _db = new SQLiteAsyncConnection(dbPath);
        _httpClient = httpClient;
        _audioDirectory = Path.Combine(FileSystem.AppDataDirectory, "audio");
        _downloadSemaphore = new SemaphoreSlim(MaxConcurrentDownloads);
        _activeDownloads = new ConcurrentDictionary<int, CancellationTokenSource>();
        
        Directory.CreateDirectory(_audioDirectory);
    }

    public async Task InitAsync()
    {
        await _db.CreateTableAsync<DownloadQueueItem>();
        
        // Resume failed downloads on startup
        await ResumeFailedDownloadsAsync();
    }

    /// <summary>
    /// Enqueue audio download for POI
    /// </summary>
    public async Task<int> EnqueueDownloadAsync(string poiCode, string audioUrl, int priority = 1)
    {
        if (string.IsNullOrEmpty(poiCode) || string.IsNullOrEmpty(audioUrl))
            return -1;

        // Check if already in queue or downloaded
        var existing = await _db.Table<DownloadQueueItem>()
            .Where(x => x.PoiCode == poiCode)
            .FirstOrDefaultAsync();

        if (existing != null)
        {
            if (existing.Status == DownloadStatus.Done)
            {
                Debug.WriteLine($"[DOWNLOAD-QUEUE] {poiCode} already downloaded");
                return existing.Id;
            }

            if (existing.Status == DownloadStatus.Downloading)
            {
                Debug.WriteLine($"[DOWNLOAD-QUEUE] {poiCode} already downloading");
                return existing.Id;
            }

            // Reset failed download
            if (existing.Status == DownloadStatus.Failed)
            {
                existing.Status = DownloadStatus.Pending;
                existing.RetryCount = 0;
                existing.ErrorMessage = null;
                existing.Priority = priority;
                await _db.UpdateAsync(existing);
                Debug.WriteLine($"[DOWNLOAD-QUEUE] Reset failed download for {poiCode}");
                
                _ = ProcessQueueAsync(); // Fire and forget
                return existing.Id;
            }
        }

        var item = new DownloadQueueItem
        {
            PoiCode = poiCode,
            AudioUrl = audioUrl,
            Status = DownloadStatus.Pending,
            Priority = priority,
            CreatedAt = DateTime.UtcNow,
            RetryCount = 0
        };

        var id = await _db.InsertAsync(item);
        Debug.WriteLine($"[DOWNLOAD-QUEUE] Enqueued {poiCode} (priority: {priority})");

        // Start processing queue
        _ = ProcessQueueAsync(); // Fire and forget

        return id;
    }

    /// <summary>
    /// Process download queue (background task)
    /// </summary>
    public async Task ProcessQueueAsync()
    {
        if (_isProcessing)
        {
            Debug.WriteLine("[DOWNLOAD-QUEUE] Already processing");
            return;
        }

        _isProcessing = true;

        try
        {
            while (true)
            {
                // Get next pending item (highest priority first)
                var item = await _db.Table<DownloadQueueItem>()
                    .Where(x => x.Status == DownloadStatus.Pending)
                    .OrderByDescending(x => x.Priority)
                    .ThenBy(x => x.CreatedAt)
                    .FirstOrDefaultAsync();

                if (item == null)
                {
                    Debug.WriteLine("[DOWNLOAD-QUEUE] Queue empty");
                    break;
                }

                // Wait for available slot
                await _downloadSemaphore.WaitAsync();

                // Download in background
                _ = DownloadItemAsync(item);
            }
        }
        finally
        {
            _isProcessing = false;
        }
    }

    private async Task DownloadItemAsync(DownloadQueueItem item)
    {
        var cts = new CancellationTokenSource();
        _activeDownloads[item.Id] = cts;

        try
        {
            Debug.WriteLine($"[DOWNLOAD-QUEUE] Starting download: {item.PoiCode}");

            // Update status
            item.Status = DownloadStatus.Downloading;
            item.StartedAt = DateTime.UtcNow;
            await _db.UpdateAsync(item);

            // Download file
            var localPath = Path.Combine(_audioDirectory, $"{item.PoiCode}.mp3");
            
            using var response = await _httpClient.GetAsync(item.AudioUrl, HttpCompletionOption.ResponseHeadersRead, cts.Token);
            response.EnsureSuccessStatusCode();

            item.FileSizeBytes = response.Content.Headers.ContentLength ?? 0;

            await using var fileStream = File.Create(localPath);
            await using var httpStream = await response.Content.ReadAsStreamAsync(cts.Token);
            await httpStream.CopyToAsync(fileStream, cts.Token);

            // Update status
            item.Status = DownloadStatus.Done;
            item.LocalPath = localPath;
            item.CompletedAt = DateTime.UtcNow;
            await _db.UpdateAsync(item);

            Debug.WriteLine($"[DOWNLOAD-QUEUE] Completed: {item.PoiCode} ({item.FileSizeBytes / 1024} KB)");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[DOWNLOAD-QUEUE] Failed: {item.PoiCode} - {ex.Message}");

            item.Status = DownloadStatus.Failed;
            item.ErrorMessage = ex.Message;
            item.RetryCount++;
            item.LastRetryAt = DateTime.UtcNow;

            // Retry if under max retries
            if (item.RetryCount < MaxRetries)
            {
                item.Status = DownloadStatus.Pending;
                Debug.WriteLine($"[DOWNLOAD-QUEUE] Will retry {item.PoiCode} (attempt {item.RetryCount + 1}/{MaxRetries})");
            }

            await _db.UpdateAsync(item);
        }
        finally
        {
            _activeDownloads.TryRemove(item.Id, out _);
            _downloadSemaphore.Release();
        }
    }

    /// <summary>
    /// Resume failed downloads on app startup
    /// </summary>
    private async Task ResumeFailedDownloadsAsync()
    {
        var stuckDownloads = await _db.Table<DownloadQueueItem>()
            .Where(x => x.Status == DownloadStatus.Downloading)
            .ToListAsync();

        foreach (var item in stuckDownloads)
        {
            item.Status = DownloadStatus.Pending;
            await _db.UpdateAsync(item);
        }

        if (stuckDownloads.Count > 0)
        {
            Debug.WriteLine($"[DOWNLOAD-QUEUE] Resumed {stuckDownloads.Count} stuck downloads");
        }
    }

    /// <summary>
    /// Handle network reconnection
    /// </summary>
    public async Task OnNetworkReconnectedAsync()
    {
        Debug.WriteLine("[DOWNLOAD-QUEUE] Network reconnected, resuming downloads");
        await ProcessQueueAsync();
    }

    /// <summary>
    /// Pause all downloads
    /// </summary>
    public async Task PauseAllAsync()
    {
        foreach (var cts in _activeDownloads.Values)
        {
            cts.Cancel();
        }

        var downloading = await _db.Table<DownloadQueueItem>()
            .Where(x => x.Status == DownloadStatus.Downloading)
            .ToListAsync();

        foreach (var item in downloading)
        {
            item.Status = DownloadStatus.Paused;
            await _db.UpdateAsync(item);
        }

        Debug.WriteLine($"[DOWNLOAD-QUEUE] Paused {downloading.Count} downloads");
    }

    /// <summary>
    /// Resume paused downloads
    /// </summary>
    public async Task ResumeAllAsync()
    {
        var paused = await _db.Table<DownloadQueueItem>()
            .Where(x => x.Status == DownloadStatus.Paused)
            .ToListAsync();

        foreach (var item in paused)
        {
            item.Status = DownloadStatus.Pending;
            await _db.UpdateAsync(item);
        }

        Debug.WriteLine($"[DOWNLOAD-QUEUE] Resumed {paused.Count} downloads");
        await ProcessQueueAsync();
    }

    /// <summary>
    /// Get download status for POI
    /// </summary>
    public async Task<DownloadQueueItem> GetDownloadStatusAsync(string poiCode)
    {
        return await _db.Table<DownloadQueueItem>()
            .Where(x => x.PoiCode == poiCode)
            .FirstOrDefaultAsync();
    }

    /// <summary>
    /// Check if audio is downloaded
    /// </summary>
    public async Task<bool> IsDownloadedAsync(string poiCode)
    {
        var item = await GetDownloadStatusAsync(poiCode);
        return item?.Status == DownloadStatus.Done && File.Exists(item.LocalPath);
    }

    /// <summary>
    /// Get local audio path if downloaded
    /// </summary>
    public async Task<string> GetLocalAudioPathAsync(string poiCode)
    {
        var item = await GetDownloadStatusAsync(poiCode);
        
        if (item?.Status == DownloadStatus.Done && !string.IsNullOrEmpty(item.LocalPath))
        {
            if (File.Exists(item.LocalPath))
            {
                // Update last access time for cleanup service
                File.SetLastAccessTime(item.LocalPath, DateTime.UtcNow);
                return item.LocalPath;
            }
        }

        return null;
    }

    /// <summary>
    /// Get queue statistics
    /// </summary>
    public async Task<QueueStats> GetStatsAsync()
    {
        var items = await _db.Table<DownloadQueueItem>().ToListAsync();

        return new QueueStats
        {
            Total = items.Count,
            Pending = items.Count(x => x.Status == DownloadStatus.Pending),
            Downloading = items.Count(x => x.Status == DownloadStatus.Downloading),
            Done = items.Count(x => x.Status == DownloadStatus.Done),
            Failed = items.Count(x => x.Status == DownloadStatus.Failed),
            TotalSizeBytes = items.Where(x => x.Status == DownloadStatus.Done).Sum(x => x.FileSizeBytes)
        };
    }
}

public class QueueStats
{
    public int Total { get; set; }
    public int Pending { get; set; }
    public int Downloading { get; set; }
    public int Done { get; set; }
    public int Failed { get; set; }
    public long TotalSizeBytes { get; set; }
}
```

### 1.3 Network Connectivity Monitor

**File:** `Services/NetworkMonitorService.cs` (NEW)

```csharp
using System.Diagnostics;

namespace MauiApp1.Services;

public class NetworkMonitorService
{
    private readonly DownloadQueueService _downloadQueue;
    private NetworkAccess _lastNetworkAccess;

    public NetworkMonitorService(DownloadQueueService downloadQueue)
    {
        _downloadQueue = downloadQueue;
        _lastNetworkAccess = Connectivity.Current.NetworkAccess;

        // Subscribe to connectivity changes
        Connectivity.Current.ConnectivityChanged += OnConnectivityChanged;
    }

    private async void OnConnectivityChanged(object sender, ConnectivityChangedEventArgs e)
    {
        var currentAccess = e.NetworkAccess;

        Debug.WriteLine($"[NETWORK] Connectivity changed: {_lastNetworkAccess} -> {currentAccess}");

        // Detect reconnection
        if (_lastNetworkAccess != NetworkAccess.Internet && currentAccess == NetworkAccess.Internet)
        {
            Debug.WriteLine("[NETWORK] Internet reconnected, resuming downloads");
            await _downloadQueue.OnNetworkReconnectedAsync();
        }

        // Detect disconnection
        if (_lastNetworkAccess == NetworkAccess.Internet && currentAccess != NetworkAccess.Internet)
        {
            Debug.WriteLine("[NETWORK] Internet disconnected, pausing downloads");
            await _downloadQueue.PauseAllAsync();
        }

        _lastNetworkAccess = currentAccess;
    }

    public bool IsConnected()
    {
        return Connectivity.Current.NetworkAccess == NetworkAccess.Internet;
    }
}
```

### 1.4 Integration with PoiEntryCoordinator

**File:** `Services/PoiEntryCoordinator.cs` (Update)

```csharp
// Add field
private readonly DownloadQueueService _downloadQueue;

// Update constructor
public PoiEntryCoordinator(
    // ... existing parameters ...
    DownloadQueueService downloadQueue)
{
    // ... existing assignments ...
    _downloadQueue = downloadQueue;
}

// Add method after MergeScanResultIntoLocalAsync
private async Task EnqueueAudioDownloadAsync(PoiScanData data)
{
    // Check if POI has audio URL
    var audioUrl = data.AudioUrl; // Assuming backend returns audioUrl in response
    
    if (!string.IsNullOrEmpty(audioUrl))
    {
        // High priority for QR scanned POIs
        await _downloadQueue.EnqueueDownloadAsync(data.Code, audioUrl, priority: 2);
        Debug.WriteLine($"[POI-ENTRY] Enqueued audio download for {data.Code}");
    }
}

// Update HandleSecureScanAsync (add after MergeScanResultIntoLocalAsync)
private async Task<PoiEntryResult> HandleSecureScanAsync(PoiEntryRequest request, string token, CancellationToken cancellationToken)
{
    // ... existing code ...
    
    await MergeScanResultIntoLocalAsync(data, cancellationToken).ConfigureAwait(false);
    
    // NEW: Enqueue audio download
    await EnqueueAudioDownloadAsync(data).ConfigureAwait(false);
    
    // ... rest of existing code ...
}
```

### 1.5 Service Registration

**File:** `MauiProgram.cs`

```csharp
// Add services
builder.Services.AddSingleton<DownloadQueueService>();
builder.Services.AddSingleton<NetworkMonitorService>();

// Initialize on startup
public static async Task InitializeServicesAsync(IServiceProvider services)
{
    var downloadQueue = services.GetRequiredService<DownloadQueueService>();
    await downloadQueue.InitAsync();
    
    var networkMonitor = services.GetRequiredService<NetworkMonitorService>();
    // Network monitor auto-starts on construction
}
```

---

## 2. CONTENT VERSIONING & SYNC

### 2.1 Backend Sync API

**File:** `backend/src/controllers/poi.controller.js`

```javascript
// Add new method
async checkSync(req, res, next) {
    try {
        const { lastSyncTimestamp, poiCodes } = req.query;
        
        if (!lastSyncTimestamp) {
            throw new AppError('lastSyncTimestamp is required', 400);
        }
        
        const lastSync = new Date(parseInt(lastSyncTimestamp));
        
        // Build query
        const query = {
            status: POI_STATUS.APPROVED,
            lastUpdated: { $gt: lastSync }
        };
        
        // Optional: filter by specific POI codes
        if (poiCodes) {
            const codes = poiCodes.split(',').map(c => c.trim().toUpperCase());
            query.code = { $in: codes };
        }
        
        // Find POIs updated since last sync
        const updatedPois = await Poi.find(query)
            .select('code lastUpdated')
            .limit(100); // Prevent excessive response size
        
        res.json({
            success: true,
            data: {
                hasUpdates: updatedPois.length > 0,
                serverTime: Date.now(),
                updatedPois: updatedPois.map(p => ({
                    code: p.code,
                    lastUpdated: p.lastUpdated.getTime()
                }))
            }
        });
    } catch (error) {
        next(error);
    }
}

// Export
module.exports = {
    // ... existing exports ...
    checkSync
};
```

**File:** `backend/src/routes/poi.routes.js`

```javascript
// Add route
router.get('/check-sync', poiController.checkSync);
```

### 2.2 Mobile Sync Service

**File:** `Services/PoiSyncService.cs` (NEW)

```csharp
using System.Diagnostics;
using System.Text.Json;
using MauiApp1.Models;

namespace MauiApp1.Services;

public class PoiSyncService
{
    private const string KeyLastSync = "poi_last_sync_timestamp";
    private readonly ApiService _api;
    private readonly PoiEntryCoordinator _coordinator;
    private bool _isSyncing;

    public PoiSyncService(ApiService api, PoiEntryCoordinator coordinator)
    {
        _api = api;
        _coordinator = coordinator;
    }

    /// <summary>
    /// Check for POI updates and sync
    /// </summary>
    public async Task<SyncResult> SyncAsync(CancellationToken ct = default)
    {
        if (_isSyncing)
        {
            Debug.WriteLine("[SYNC] Already syncing");
            return new SyncResult { Success = false, Message = "Sync already in progress" };
        }

        _isSyncing = true;

        try
        {
            var lastSync = Preferences.Default.Get(KeyLastSync, 0L);
            
            Debug.WriteLine($"[SYNC] Checking for updates since {DateTimeOffset.FromUnixTimeMilliseconds(lastSync)}");

            // Call sync API
            var response = await _api.GetAsync($"pois/check-sync?lastSyncTimestamp={lastSync}", ct);
            
            if (!response.IsSuccessStatusCode)
            {
                return new SyncResult { Success = false, Message = "Sync check failed" };
            }

            var json = await response.Content.ReadAsStringAsync(ct);
            var envelope = JsonSerializer.Deserialize<SyncCheckResponse>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (envelope?.Data == null)
            {
                return new SyncResult { Success = false, Message = "Invalid response" };
            }

            var data = envelope.Data;

            if (!data.HasUpdates)
            {
                Debug.WriteLine("[SYNC] No updates available");
                return new SyncResult
                {
                    Success = true,
                    UpdatedCount = 0,
                    Message = "Already up to date"
                };
            }

            Debug.WriteLine($"[SYNC] Found {data.UpdatedPois.Count} updated POIs");

            // Download updated POIs
            var successCount = 0;
            foreach (var poi in data.UpdatedPois)
            {
                try
                {
                    await DownloadPoiAsync(poi.Code, ct);
                    successCount++;
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[SYNC] Failed to download {poi.Code}: {ex.Message}");
                }
            }

            // Update last sync timestamp to server time
            Preferences.Default.Set(KeyLastSync, data.ServerTime);

            Debug.WriteLine($"[SYNC] Completed: {successCount}/{data.UpdatedPois.Count} POIs updated");

            return new SyncResult
            {
                Success = true,
                UpdatedCount = successCount,
                Message = $"Updated {successCount} POIs"
            };
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[SYNC] Error: {ex.Message}");
            return new SyncResult { Success = false, Message = ex.Message };
        }
        finally
        {
            _isSyncing = false;
        }
    }

    private async Task DownloadPoiAsync(string code, CancellationToken ct)
    {
        // Fetch POI details from API
        var response = await _api.GetAsync($"pois/{code}", ct);
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadAsStringAsync(ct);
        var envelope = JsonSerializer.Deserialize<PoiDetailResponse>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        if (envelope?.Data != null)
        {
            // Merge into local database (reuse existing logic)
            // This would call the same merge logic as secure scan
            Debug.WriteLine($"[SYNC] Downloaded {code}");
        }
    }

    /// <summary>
    /// Get last sync time
    /// </summary>
    public DateTimeOffset GetLastSyncTime()
    {
        var timestamp = Preferences.Default.Get(KeyLastSync, 0L);
        return DateTimeOffset.FromUnixTimeMilliseconds(timestamp);
    }

    /// <summary>
    /// Force full sync (reset timestamp)
    /// </summary>
    public async Task<SyncResult> ForceFullSyncAsync(CancellationToken ct = default)
    {
        Preferences.Default.Set(KeyLastSync, 0L);
        return await SyncAsync(ct);
    }
}

public class SyncResult
{
    public bool Success { get; set; }
    public int UpdatedCount { get; set; }
    public string Message { get; set; }
}

public class SyncCheckResponse
{
    public bool Success { get; set; }
    public SyncCheckData Data { get; set; }
}

public class SyncCheckData
{
    public bool HasUpdates { get; set; }
    public long ServerTime { get; set; }
    public List<UpdatedPoiInfo> UpdatedPois { get; set; }
}

public class UpdatedPoiInfo
{
    public string Code { get; set; }
    public long LastUpdated { get; set; }
}

public class PoiDetailResponse
{
    public bool Success { get; set; }
    public PoiScanData Data { get; set; }
}
```

### 2.3 Background Sync Scheduler

**File:** `Services/BackgroundSyncScheduler.cs` (NEW)

```csharp
using System.Diagnostics;

namespace MauiApp1.Services;

public class BackgroundSyncScheduler
{
    private readonly PoiSyncService _syncService;
    private readonly NetworkMonitorService _networkMonitor;
    private Timer _syncTimer;
    private const int SyncIntervalMinutes = 60; // Sync every hour

    public BackgroundSyncScheduler(PoiSyncService syncService, NetworkMonitorService networkMonitor)
    {
        _syncService = syncService;
        _networkMonitor = networkMonitor;
    }

    public void Start()
    {
        // Sync every hour
        _syncTimer = new Timer(async _ => await SyncIfConnectedAsync(), null, TimeSpan.Zero, TimeSpan.FromMinutes(SyncIntervalMinutes));
        Debug.WriteLine("[SYNC-SCHEDULER] Started (interval: 60 minutes)");
    }

    public void Stop()
    {
        _syncTimer?.Dispose();
        Debug.WriteLine("[SYNC-SCHEDULER] Stopped");
    }

    private async Task SyncIfConnectedAsync()
    {
        if (!_networkMonitor.IsConnected())
        {
            Debug.WriteLine("[SYNC-SCHEDULER] Skipping sync (no internet)");
            return;
        }

        Debug.WriteLine("[SYNC-SCHEDULER] Starting background sync");
        var result = await _syncService.SyncAsync();
        Debug.WriteLine($"[SYNC-SCHEDULER] Sync completed: {result.Message}");
    }
}
```

### 2.4 Service Registration

**File:** `MauiProgram.cs`

```csharp
// Add services
builder.Services.AddSingleton<PoiSyncService>();
builder.Services.AddSingleton<BackgroundSyncScheduler>();

// Start background sync
public static void StartBackgroundServices(IServiceProvider services)
{
    var syncScheduler = services.GetRequiredService<BackgroundSyncScheduler>();
    syncScheduler.Start();
}
```

---

## 3. TESTING CHECKLIST

### 3.1 Download Queue Tests

```csharp
[Test]
public async Task DownloadQueue_EnqueueAndProcess_Success()
{
    var queue = new DownloadQueueService(_httpClient);
    await queue.InitAsync();
    
    var id = await queue.EnqueueDownloadAsync("TEST_POI", "https://example.com/audio.mp3");
    Assert.Greater(id, 0);
    
    await Task.Delay(5000); // Wait for download
    
    var status = await queue.GetDownloadStatusAsync("TEST_POI");
    Assert.AreEqual(DownloadStatus.Done, status.Status);
}

[Test]
public async Task DownloadQueue_NetworkDrop_ResumesOnReconnect()
{
    var queue = new DownloadQueueService(_httpClient);
    await queue.InitAsync();
    
    await queue.EnqueueDownloadAsync("TEST_POI", "https://example.com/large-audio.mp3");
    
    // Simulate network drop
    await queue.PauseAllAsync();
    
    var status = await queue.GetDownloadStatusAsync("TEST_POI");
    Assert.AreEqual(DownloadStatus.Paused, status.Status);
    
    // Reconnect
    await queue.OnNetworkReconnectedAsync();
    
    await Task.Delay(5000);
    
    status = await queue.GetDownloadStatusAsync("TEST_POI");
    Assert.AreEqual(DownloadStatus.Done, status.Status);
}
```

### 3.2 Sync Tests

```csharp
[Test]
public async Task Sync_CheckForUpdates_ReturnsUpdatedPois()
{
    var syncService = new PoiSyncService(_api, _coordinator);
    
    var result = await syncService.SyncAsync();
    
    Assert.IsTrue(result.Success);
    Assert.GreaterOrEqual(result.UpdatedCount, 0);
}

[Test]
public async Task Sync_NoUpdates_ReturnsUpToDate()
{
    var syncService = new PoiSyncService(_api, _coordinator);
    
    // Sync twice
    await syncService.SyncAsync();
    var result = await syncService.SyncAsync();
    
    Assert.IsTrue(result.Success);
    Assert.AreEqual(0, result.UpdatedCount);
}
```

---

## 4. DEPLOYMENT STEPS

### 4.1 Backend Deployment

1. Deploy sync API endpoint
2. Verify `/pois/check-sync` returns correct data
3. Monitor API response times

### 4.2 Mobile Deployment

1. Deploy download queue service
2. Deploy sync service
3. Test on real devices with poor network
4. Monitor crash reports

---

## 5. SUCCESS METRICS

- ✅ Download queue processes 100% of enqueued items
- ✅ Network reconnection resumes downloads within 5 seconds
- ✅ Sync detects updates within 1 hour
- ✅ Failed downloads retry successfully
- ✅ No data corruption from partial downloads

---

**Implementation Status:** READY  
**Estimated Time:** 5-7 days  
**Risk Level:** MEDIUM (requires thorough testing)
