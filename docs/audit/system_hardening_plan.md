# VN-GO-Travel6 System Hardening Plan

**Date:** 2026-04-23  
**Auditor:** Senior System Architect + Security Engineer + Mobile Backend Specialist  
**Status:** PRODUCTION READINESS ASSESSMENT

---

## EXECUTIVE SUMMARY

This document provides a comprehensive security hardening and production readiness plan for the VN-GO-Travel6 system. The audit covers QR security, credit transactions, offline synchronization, storage optimization, and data consistency.

**Current State:**
- ✅ Basic QR scanning functional
- ✅ Credit transaction system with optimistic locking
- ✅ Rate limiting infrastructure in place
- ✅ QR security tracking implemented
- ⚠️ JWT tokens have no expiration
- ⚠️ No offline download queue
- ⚠️ No content versioning/sync strategy
- ⚠️ No storage cleanup mechanism
- ⚠️ Guest scan rate limiting only on mobile (bypassable)

**Risk Level:** MEDIUM-HIGH (requires hardening before production)

---

## 1. QR SECURITY HARDENING

### 1.1 Current Implementation

**Format:**
```javascript
// Current JWT payload (backend/src/services/poi.service.js:697-700)
{
  code: "HOGUOM",
  type: "static_secure_qr"
}
// No expiration, permanent tokens
```

**Validation:**
- ✅ JWT signature verification
- ✅ POI status check (APPROVED only)
- ✅ Premium access control
- ✅ Token usage tracking (qr-security.service.js)
- ✅ Abuse detection (>100 scans/hour auto-blacklist)
- ❌ No token expiration
- ❌ No token revocation without blacklist

### 1.2 Security Vulnerabilities

**CRITICAL:**
1. **Permanent JWT tokens** - If JWT_SECRET is compromised, all tokens remain valid forever
2. **No token rotation** - Cannot invalidate specific tokens without blacklist
3. **Guest scan bypass** - Mobile quota (10/day) can be reset by clearing app data

**MEDIUM:**
4. **Backend quota is cumulative** - Users get 20 scans total, not per day (inconsistent with mobile)
5. **No device fingerprinting** - Guest users can use multiple devices

### 1.3 Hardening Recommendations

#### ✅ ALREADY IMPLEMENTED (Good!)
- JWT signature verification
- QR token usage tracking with abuse detection
- Rate limiting (20/min per IP, 10/min per user)
- Invalid QR scan tracking (5/min per IP)
- Auto-blacklist for abusive tokens

#### 🔧 REQUIRED IMPROVEMENTS

**Priority 1: Add JWT Expiration**

```javascript
// backend/src/services/poi.service.js
async generateQrScanTokenForAdmin(rawPoiId) {
    // ... existing code ...
    const token = jwt.sign(
        { 
            code, 
            type: 'static_secure_qr',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year
        },
        config.jwtSecret
    );
    // ... rest of code ...
}
```

**Impact:** Requires QR code regeneration annually, but limits damage if secret is compromised.

**Priority 2: Align Backend Quota with Mobile (Daily Reset)**

```javascript
// backend/src/models/user.model.js - Add fields:
qrScanCount: { type: Number, default: 0, min: 0 },
qrScanLastResetDate: { type: String, default: null }, // Format: YYYY-MM-DD

// backend/src/repositories/user.repository.js - Update logic:
async incrementQrScanCountIfAllowed(userId, limit = 20) {
    const today = new Date().toISOString().split('T')[0];
    
    // Reset if new day
    await User.updateMany(
        { qrScanLastResetDate: { $ne: today } },
        { $set: { qrScanCount: 0, qrScanLastResetDate: today } }
    );
    
    // Increment with limit check
    return await User.findOneAndUpdate(
        {
            _id: userId,
            isPremium: false,
            isActive: true,
            qrScanCount: { $lt: limit }
        },
        { 
            $inc: { qrScanCount: 1 },
            $set: { qrScanLastResetDate: today }
        },
        { new: true }
    );
}
```

**Priority 3: Enhanced Rate Limiting (Already Good, Minor Tweaks)**

Current implementation in `advanced-rate-limit.middleware.js` is solid:
- ✅ Redis-based distributed rate limiting
- ✅ IP-based limits (20/min for QR scans)
- ✅ User-based limits (10/min)
- ✅ Invalid scan tracking (5/min)

**Recommendation:** Add device-based rate limiting for guest users:

```javascript
// Add to advanced-rate-limit.middleware.js
const qrScanDeviceRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 15, // Per device
    message: 'Too many QR scan attempts from this device',
    prefix: 'rl:qr:device:',
    keyGenerator: (req) => {
        const deviceId = req.headers['x-device-id'];
        if (deviceId) {
            return `device:${deviceId}`;
        }
        return req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    }
});
```

---

## 2. CREDIT TRANSACTION SAFETY

### 2.1 Current Implementation

**Excellent Implementation! ✅**

The purchase system already implements atomic transactions correctly:

```javascript
// backend/src/services/purchase.service.js:18-106
async purchasePoi(userId, poiCode) {
    const session = await mongoose.startSession();
    
    await session.withTransaction(async () => {
        // 1. Check if already unlocked
        // 2. Get POI and validate
        // 3. Get wallet with current version
        // 4. Deduct credits atomically (optimistic locking)
        // 5. Unlock POI
        // 6. Record transaction
    });
}
```

**Key Features:**
- ✅ MongoDB transactions (ACID guarantees)
- ✅ Optimistic locking (version field prevents race conditions)
- ✅ Idempotency (duplicate unlock check)
- ✅ Audit trail (CreditTransaction records)
- ✅ Rollback on failure

### 2.2 Edge Cases Handled

✅ **Insufficient credits** - Checked before deduction  
✅ **Double-click purchase** - Optimistic locking prevents concurrent deductions  
✅ **Network failure mid-transaction** - MongoDB transaction auto-rollback  
✅ **Already unlocked** - Early return with error  

### 2.3 Recommendations

**Minor Enhancement: Add Idempotency Key**

```javascript
// For mobile app retry safety
async purchasePoi(userId, poiCode, idempotencyKey = null) {
    if (idempotencyKey) {
        // Check if transaction already completed
        const existing = await CreditTransaction.findOne({
            userId,
            'metadata.idempotencyKey': idempotencyKey
        });
        
        if (existing) {
            return { success: true, message: 'Already processed', duplicate: true };
        }
    }
    
    // ... rest of transaction logic ...
    
    await CreditTransaction.record({
        // ... existing fields ...
        metadata: {
            ...data.metadata,
            idempotencyKey
        }
    }, { session });
}
```

---

## 3. OFFLINE DOWNLOAD QUEUE

### 3.1 Current State

❌ **NOT IMPLEMENTED**

Current flow:
- QR scan → Backend API call → Merge to SQLite → Navigate
- No offline queue for audio downloads
- No background download management

### 3.2 Required Implementation

**Mobile App: Download Queue Service**

```csharp
// Services/DownloadQueueService.cs
public class DownloadQueueService
{
    private readonly SQLiteAsyncConnection _db;
    
    public async Task EnqueueDownloadAsync(string poiCode, string audioUrl)
    {
        await _db.InsertAsync(new DownloadQueueItem
        {
            PoiCode = poiCode,
            AudioUrl = audioUrl,
            Status = DownloadStatus.Pending,
            CreatedAt = DateTime.UtcNow
        });
        
        // Trigger background download
        await ProcessQueueAsync();
    }
    
    public async Task ProcessQueueAsync()
    {
        var pending = await _db.Table<DownloadQueueItem>()
            .Where(x => x.Status == DownloadStatus.Pending)
            .ToListAsync();
        
        foreach (var item in pending)
        {
            try
            {
                item.Status = DownloadStatus.Downloading;
                await _db.UpdateAsync(item);
                
                // Download audio file
                var localPath = await DownloadAudioAsync(item.AudioUrl);
                
                item.Status = DownloadStatus.Done;
                item.LocalPath = localPath;
                item.CompletedAt = DateTime.UtcNow;
                await _db.UpdateAsync(item);
            }
            catch (Exception ex)
            {
                item.Status = DownloadStatus.Failed;
                item.ErrorMessage = ex.Message;
                item.RetryCount++;
                await _db.UpdateAsync(item);
            }
        }
    }
    
    // Handle network reconnection
    public async Task OnNetworkReconnectedAsync()
    {
        await ProcessQueueAsync();
    }
}

// Models/DownloadQueueItem.cs
public class DownloadQueueItem
{
    [PrimaryKey, AutoIncrement]
    public int Id { get; set; }
    
    public string PoiCode { get; set; }
    public string AudioUrl { get; set; }
    public DownloadStatus Status { get; set; }
    public string LocalPath { get; set; }
    public string ErrorMessage { get; set; }
    public int RetryCount { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
}

public enum DownloadStatus
{
    Pending,
    Downloading,
    Done,
    Failed
}
```

**Integration:**

```csharp
// Services/PoiEntryCoordinator.cs - Add after MergeScanResultIntoLocalAsync
private async Task EnqueueAudioDownloadAsync(PoiScanData data)
{
    if (!string.IsNullOrEmpty(data.AudioUrl))
    {
        await _downloadQueue.EnqueueDownloadAsync(data.Code, data.AudioUrl);
    }
}
```

---

## 4. VERSIONING & SYNC STRATEGY

### 4.1 Current State

✅ **Partial Implementation**

```javascript
// backend/src/models/poi.model.js:28
lastUpdated: { type: Date, default: Date.now }
```

❌ **Missing:**
- No sync API endpoint
- No client-side version tracking
- No incremental update mechanism

### 4.2 Required Implementation

**Backend: Sync Check Endpoint**

```javascript
// backend/src/controllers/poi.controller.js
async checkSync(req, res, next) {
    try {
        const { lastSyncTimestamp } = req.query;
        
        if (!lastSyncTimestamp) {
            throw new AppError('lastSyncTimestamp is required', 400);
        }
        
        const lastSync = new Date(parseInt(lastSyncTimestamp));
        
        // Find POIs updated since last sync
        const updatedPois = await Poi.find({
            status: POI_STATUS.APPROVED,
            lastUpdated: { $gt: lastSync }
        }).select('code lastUpdated');
        
        res.json({
            success: true,
            data: {
                hasUpdates: updatedPois.length > 0,
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

// Route: GET /api/v1/pois/check-sync?lastSyncTimestamp=1714737170000
```

**Mobile: Sync Service**

```csharp
// Services/PoiSyncService.cs
public class PoiSyncService
{
    private const string KeyLastSync = "poi_last_sync_timestamp";
    
    public async Task<SyncResult> CheckForUpdatesAsync()
    {
        var lastSync = Preferences.Default.Get(KeyLastSync, 0L);
        
        var response = await _api.GetAsync($"pois/check-sync?lastSyncTimestamp={lastSync}");
        var data = await response.Content.ReadFromJsonAsync<SyncCheckResponse>();
        
        if (data.HasUpdates)
        {
            // Download only updated POIs
            foreach (var poi in data.UpdatedPois)
            {
                await DownloadPoiAsync(poi.Code);
            }
            
            // Update last sync timestamp
            Preferences.Default.Set(KeyLastSync, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        }
        
        return new SyncResult
        {
            UpdatedCount = data.UpdatedPois.Count,
            LastSync = DateTimeOffset.FromUnixTimeMilliseconds(lastSync)
        };
    }
}
```

---

## 5. STORAGE CLEANUP (CRITICAL)

### 5.1 Current State

❌ **NOT IMPLEMENTED**

Risk: Unlimited storage growth, app will eventually fill device storage.

### 5.2 Required Implementation

**Mobile: Storage Cleanup Service**

```csharp
// Services/StorageCleanupService.cs
public class StorageCleanupService
{
    private const int MaxAgeInDays = 30;
    private readonly string _audioDirectory;
    
    public StorageCleanupService()
    {
        _audioDirectory = Path.Combine(FileSystem.AppDataDirectory, "audio");
    }
    
    public async Task CleanupOldAudioFilesAsync()
    {
        if (!Directory.Exists(_audioDirectory))
            return;
        
        var files = Directory.GetFiles(_audioDirectory);
        var cutoffDate = DateTime.UtcNow.AddDays(-MaxAgeInDays);
        var deletedCount = 0;
        var freedBytes = 0L;
        
        foreach (var file in files)
        {
            var fileInfo = new FileInfo(file);
            var lastAccess = fileInfo.LastAccessTime;
            
            if (lastAccess < cutoffDate)
            {
                try
                {
                    freedBytes += fileInfo.Length;
                    File.Delete(file);
                    deletedCount++;
                    
                    // Keep metadata in DB, only delete file
                    var poiCode = Path.GetFileNameWithoutExtension(file);
                    await MarkAudioAsDeletedAsync(poiCode);
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[CLEANUP] Failed to delete {file}: {ex.Message}");
                }
            }
        }
        
        Debug.WriteLine($"[CLEANUP] Deleted {deletedCount} files, freed {freedBytes / 1024 / 1024} MB");
    }
    
    private async Task MarkAudioAsDeletedAsync(string poiCode)
    {
        // Update DB to mark audio as not downloaded
        // User can re-download on next access
    }
    
    // Run cleanup on app startup and periodically
    public async Task SchedulePeriodicCleanupAsync()
    {
        // Run every 7 days
        while (true)
        {
            await Task.Delay(TimeSpan.FromDays(7));
            await CleanupOldAudioFilesAsync();
        }
    }
}
```

**Integration:**

```csharp
// MauiProgram.cs
builder.Services.AddSingleton<StorageCleanupService>();

// App.xaml.cs - OnStart
var cleanup = ServiceProvider.GetService<StorageCleanupService>();
_ = cleanup.SchedulePeriodicCleanupAsync(); // Fire and forget
```

---

## 6. FAILURE SCENARIOS & TESTING

### 6.1 Test Cases

**QR Scan Failures:**
- ✅ Invalid JWT → 401 error (handled)
- ✅ Expired JWT → 401 error (needs implementation)
- ✅ POI not found → 404 error (handled)
- ✅ Premium required → 403 error (handled)
- ✅ Quota exceeded → 403 error (handled)
- ✅ Network drop during scan → Retry mechanism needed

**Credit Transaction Failures:**
- ✅ Insufficient credits → 402 error (handled)
- ✅ Concurrent purchase → Optimistic locking prevents (handled)
- ✅ Network drop mid-transaction → MongoDB rollback (handled)
- ✅ Already unlocked → Early return (handled)

**Download Failures:**
- ❌ Network drop during download → Needs queue implementation
- ❌ Partial file download → Needs integrity check
- ❌ Storage full → Needs error handling

**Sync Failures:**
- ❌ Partial sync → Needs implementation
- ❌ Corrupted data → Needs validation

### 6.2 Recommended Test Suite

```csharp
// Tests/Integration/QrScanTests.cs
[Test]
public async Task QrScan_WithExpiredToken_Returns401()
{
    var expiredToken = GenerateExpiredJwt();
    var result = await _coordinator.HandleEntryAsync(new PoiEntryRequest
    {
        RawInput = $"https://domain.com/app/scan?t={expiredToken}"
    });
    
    Assert.IsFalse(result.Success);
    Assert.Contains("expired", result.Error.ToLower());
}

[Test]
public async Task Purchase_ConcurrentRequests_OnlyOneSucceeds()
{
    var tasks = Enumerable.Range(0, 10)
        .Select(_ => _purchaseService.PurchasePoi(userId, poiCode))
        .ToArray();
    
    var results = await Task.WhenAll(tasks);
    var successCount = results.Count(r => r.Success && !r.Duplicate);
    
    Assert.AreEqual(1, successCount);
}

[Test]
public async Task Download_NetworkDrop_ResumesOnReconnect()
{
    await _downloadQueue.EnqueueDownloadAsync("POI123", "https://audio.url");
    
    // Simulate network drop
    _networkSimulator.Disconnect();
    await Task.Delay(1000);
    
    var item = await _downloadQueue.GetItemAsync("POI123");
    Assert.AreEqual(DownloadStatus.Failed, item.Status);
    
    // Reconnect
    _networkSimulator.Connect();
    await _downloadQueue.OnNetworkReconnectedAsync();
    
    item = await _downloadQueue.GetItemAsync("POI123");
    Assert.AreEqual(DownloadStatus.Done, item.Status);
}
```

---

## 7. IMPLEMENTATION PRIORITY

### Phase 1: Critical Security (Week 1)
1. ✅ Add JWT expiration (1 year)
2. ✅ Align backend quota with mobile (daily reset)
3. ✅ Add device-based rate limiting

### Phase 2: Offline Support (Week 2)
4. ⚠️ Implement download queue service
5. ⚠️ Add network reconnection handling
6. ⚠️ Implement sync check API

### Phase 3: Storage Management (Week 3)
7. ⚠️ Implement storage cleanup service
8. ⚠️ Add periodic cleanup scheduler
9. ⚠️ Add storage usage monitoring

### Phase 4: Testing & Validation (Week 4)
10. ⚠️ Write integration tests
11. ⚠️ Perform load testing
12. ⚠️ Security penetration testing

---

## 8. PRODUCTION READINESS CHECKLIST

### Security
- [ ] JWT tokens have expiration
- [x] Rate limiting enabled (Redis-based)
- [x] QR token abuse detection
- [x] Credit transactions are atomic
- [ ] Device fingerprinting for guests
- [x] HTTPS enforced
- [x] Security headers configured

### Reliability
- [x] Database transactions for critical operations
- [x] Optimistic locking for concurrent updates
- [ ] Offline download queue
- [ ] Network failure recovery
- [ ] Retry mechanisms with exponential backoff

### Performance
- [x] Database indexes on critical fields
- [x] API response caching (Redis)
- [ ] Audio file compression
- [ ] CDN for static assets
- [ ] Background download prioritization

### Monitoring
- [x] Transaction audit trail
- [x] QR scan analytics
- [ ] Storage usage metrics
- [ ] Error rate monitoring
- [ ] Performance metrics (APM)

### Data Integrity
- [x] Transaction rollback on failure
- [ ] Content versioning
- [ ] Sync conflict resolution
- [ ] Data validation on all inputs
- [ ] Backup strategy

---

## 9. CONCLUSION

**Current System Assessment:**

**Strengths:**
- ✅ Excellent credit transaction implementation (atomic, optimistic locking)
- ✅ Solid rate limiting infrastructure (Redis-based, multi-tier)
- ✅ QR security tracking with abuse detection
- ✅ Comprehensive audit trail

**Critical Gaps:**
- ⚠️ No JWT expiration (security risk)
- ⚠️ No offline download queue (poor UX)
- ⚠️ No storage cleanup (will fill device)
- ⚠️ No content sync strategy (stale data)

**Risk Assessment:**
- **Security:** MEDIUM (JWT expiration needed)
- **Reliability:** MEDIUM (offline support needed)
- **Performance:** LOW (good caching)
- **Data Integrity:** LOW (transactions solid)

**Overall Readiness:** 70% - Requires Phase 1 & 2 completion before production launch.

**Estimated Effort:**
- Phase 1 (Critical Security): 3-5 days
- Phase 2 (Offline Support): 5-7 days
- Phase 3 (Storage Management): 3-4 days
- Phase 4 (Testing): 5-7 days

**Total:** 3-4 weeks to production-ready state.

---

**Next Steps:**
1. Review this plan with team
2. Prioritize Phase 1 implementation
3. Set up staging environment for testing
4. Schedule security review after Phase 1
5. Plan load testing after Phase 2

---

**Document Version:** 1.0  
**Last Updated:** 2026-04-23  
**Next Review:** After Phase 1 completion
