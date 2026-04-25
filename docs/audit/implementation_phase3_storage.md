# Phase 3: Storage Management & Cleanup Implementation

**Priority:** HIGH  
**Timeline:** 3-4 days  
**Status:** READY FOR IMPLEMENTATION

---

## 1. STORAGE CLEANUP SERVICE

### 1.1 Core Cleanup Service

**File:** `Services/StorageCleanupService.cs` (NEW)

```csharp
using System.Diagnostics;
using SQLite;
using MauiApp1.Models;

namespace MauiApp1.Services;

public class StorageCleanupService
{
    private const int MaxAgeInDays = 30;
    private const long MaxStorageSizeBytes = 500 * 1024 * 1024; // 500 MB
    private readonly string _audioDirectory;
    private readonly SQLiteAsyncConnection _db;
    private Timer _cleanupTimer;

    public StorageCleanupService()
    {
        _audioDirectory = Path.Combine(FileSystem.AppDataDirectory, "audio");
        var dbPath = Path.Combine(FileSystem.AppDataDirectory, "pois.db");
        _db = new SQLiteAsyncConnection(dbPath);
        
        Directory.CreateDirectory(_audioDirectory);
    }

    /// <summary>
    /// Initialize cleanup service and schedule periodic cleanup
    /// </summary>
    public void Start()
    {
        // Run cleanup on startup
        _ = CleanupOldAudioFilesAsync();
        
        // Schedule periodic cleanup (every 7 days)
        _cleanupTimer = new Timer(
            async _ => await CleanupOldAudioFilesAsync(),
            null,
            TimeSpan.FromDays(7),
            TimeSpan.FromDays(7)
        );
        
        Debug.WriteLine("[CLEANUP] Service started (runs every 7 days)");
    }

    public void Stop()
    {
        _cleanupTimer?.Dispose();
        Debug.WriteLine("[CLEANUP] Service stopped");
    }

    /// <summary>
    /// Cleanup audio files not accessed in 30 days
    /// </summary>
    public async Task<CleanupResult> CleanupOldAudioFilesAsync()
    {
        Debug.WriteLine("[CLEANUP] Starting cleanup...");
        
        var result = new CleanupResult
        {
            StartTime = DateTime.UtcNow
        };

        try
        {
            if (!Directory.Exists(_audioDirectory))
            {
                Debug.WriteLine("[CLEANUP] Audio directory does not exist");
                return result;
            }

            var files = Directory.GetFiles(_audioDirectory, "*.mp3");
            var cutoffDate = DateTime.UtcNow.AddDays(-MaxAgeInDays);

            Debug.WriteLine($"[CLEANUP] Found {files.Length} audio files");
            Debug.WriteLine($"[CLEANUP] Cutoff date: {cutoffDate}");

            foreach (var file in files)
            {
                try
                {
                    var fileInfo = new FileInfo(file);
                    var lastAccess = fileInfo.LastAccessTime;

                    result.TotalFiles++;
                    result.TotalSizeBytes += fileInfo.Length;

                    // Check if file is old
                    if (lastAccess < cutoffDate)
                    {
                        var poiCode = Path.GetFileNameWithoutExtension(file);
                        
                        Debug.WriteLine($"[CLEANUP] Deleting old file: {poiCode} (last access: {lastAccess})");

                        // Delete file
                        File.Delete(file);

                        // Mark as not downloaded in queue
                        await MarkAudioAsDeletedAsync(poiCode);

                        result.DeletedFiles++;
                        result.FreedBytes += fileInfo.Length;
                    }
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[CLEANUP] Failed to process {file}: {ex.Message}");
                    result.Errors++;
                }
            }

            result.EndTime = DateTime.UtcNow;
            result.Success = true;

            Debug.WriteLine($"[CLEANUP] Completed: Deleted {result.DeletedFiles} files, freed {result.FreedBytes / 1024 / 1024} MB");

            return result;
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[CLEANUP] Error: {ex.Message}");
            result.Success = false;
            result.ErrorMessage = ex.Message;
            return result;
        }
    }

    /// <summary>
    /// Cleanup based on storage size limit
    /// </summary>
    public async Task<CleanupResult> CleanupByStorageLimitAsync()
    {
        Debug.WriteLine("[CLEANUP] Starting size-based cleanup...");

        var result = new CleanupResult
        {
            StartTime = DateTime.UtcNow
        };

        try
        {
            if (!Directory.Exists(_audioDirectory))
            {
                return result;
            }

            var files = Directory.GetFiles(_audioDirectory, "*.mp3")
                .Select(f => new FileInfo(f))
                .OrderBy(f => f.LastAccessTime) // Delete oldest accessed first
                .ToList();

            var totalSize = files.Sum(f => f.Length);
            result.TotalFiles = files.Count;
            result.TotalSizeBytes = totalSize;

            Debug.WriteLine($"[CLEANUP] Total storage: {totalSize / 1024 / 1024} MB (limit: {MaxStorageSizeBytes / 1024 / 1024} MB)");

            if (totalSize <= MaxStorageSizeBytes)
            {
                Debug.WriteLine("[CLEANUP] Storage within limit, no cleanup needed");
                result.Success = true;
                return result;
            }

            // Delete oldest files until under limit
            var currentSize = totalSize;
            foreach (var file in files)
            {
                if (currentSize <= MaxStorageSizeBytes)
                    break;

                try
                {
                    var poiCode = Path.GetFileNameWithoutExtension(file.Name);
                    
                    Debug.WriteLine($"[CLEANUP] Deleting to free space: {poiCode} ({file.Length / 1024} KB)");

                    File.Delete(file.FullName);
                    await MarkAudioAsDeletedAsync(poiCode);

                    currentSize -= file.Length;
                    result.DeletedFiles++;
                    result.FreedBytes += file.Length;
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[CLEANUP] Failed to delete {file.Name}: {ex.Message}");
                    result.Errors++;
                }
            }

            result.EndTime = DateTime.UtcNow;
            result.Success = true;

            Debug.WriteLine($"[CLEANUP] Size-based cleanup completed: Deleted {result.DeletedFiles} files, freed {result.FreedBytes / 1024 / 1024} MB");

            return result;
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[CLEANUP] Error: {ex.Message}");
            result.Success = false;
            result.ErrorMessage = ex.Message;
            return result;
        }
    }

    /// <summary>
    /// Mark audio as deleted in download queue
    /// </summary>
    private async Task MarkAudioAsDeletedAsync(string poiCode)
    {
        try
        {
            var item = await _db.Table<DownloadQueueItem>()
                .Where(x => x.PoiCode == poiCode)
                .FirstOrDefaultAsync();

            if (item != null)
            {
                item.Status = DownloadStatus.Pending;
                item.LocalPath = null;
                item.CompletedAt = null;
                await _db.UpdateAsync(item);
                
                Debug.WriteLine($"[CLEANUP] Marked {poiCode} as pending for re-download");
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[CLEANUP] Failed to update queue for {poiCode}: {ex.Message}");
        }
    }

    /// <summary>
    /// Get storage usage statistics
    /// </summary>
    public async Task<StorageStats> GetStorageStatsAsync()
    {
        var stats = new StorageStats();

        try
        {
            if (!Directory.Exists(_audioDirectory))
            {
                return stats;
            }

            var files = Directory.GetFiles(_audioDirectory, "*.mp3")
                .Select(f => new FileInfo(f))
                .ToList();

            stats.TotalFiles = files.Count;
            stats.TotalSizeBytes = files.Sum(f => f.Length);
            stats.OldestFileDate = files.Any() ? files.Min(f => f.LastAccessTime) : null;
            stats.NewestFileDate = files.Any() ? files.Max(f => f.LastAccessTime) : null;
            stats.AverageSizeBytes = files.Any() ? (long)files.Average(f => f.Length) : 0;

            // Count files older than 30 days
            var cutoffDate = DateTime.UtcNow.AddDays(-MaxAgeInDays);
            stats.OldFilesCount = files.Count(f => f.LastAccessTime < cutoffDate);
            stats.OldFilesSizeBytes = files.Where(f => f.LastAccessTime < cutoffDate).Sum(f => f.Length);

            // Storage limit info
            stats.StorageLimitBytes = MaxStorageSizeBytes;
            stats.StorageUsagePercent = (double)stats.TotalSizeBytes / MaxStorageSizeBytes * 100;
            stats.IsNearLimit = stats.StorageUsagePercent > 80;

            Debug.WriteLine($"[CLEANUP] Storage stats: {stats.TotalFiles} files, {stats.TotalSizeBytes / 1024 / 1024} MB ({stats.StorageUsagePercent:F1}%)");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[CLEANUP] Failed to get storage stats: {ex.Message}");
        }

        return stats;
    }

    /// <summary>
    /// Delete specific audio file
    /// </summary>
    public async Task<bool> DeleteAudioAsync(string poiCode)
    {
        try
        {
            var filePath = Path.Combine(_audioDirectory, $"{poiCode}.mp3");
            
            if (File.Exists(filePath))
            {
                File.Delete(filePath);
                await MarkAudioAsDeletedAsync(poiCode);
                
                Debug.WriteLine($"[CLEANUP] Deleted audio for {poiCode}");
                return true;
            }

            return false;
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[CLEANUP] Failed to delete audio for {poiCode}: {ex.Message}");
            return false;
        }
    }

    /// <summary>
    /// Clear all audio files (for testing or user request)
    /// </summary>
    public async Task<CleanupResult> ClearAllAudioAsync()
    {
        Debug.WriteLine("[CLEANUP] Clearing all audio files...");

        var result = new CleanupResult
        {
            StartTime = DateTime.UtcNow
        };

        try
        {
            if (!Directory.Exists(_audioDirectory))
            {
                result.Success = true;
                return result;
            }

            var files = Directory.GetFiles(_audioDirectory, "*.mp3");
            result.TotalFiles = files.Length;

            foreach (var file in files)
            {
                try
                {
                    var fileInfo = new FileInfo(file);
                    result.TotalSizeBytes += fileInfo.Length;

                    File.Delete(file);

                    var poiCode = Path.GetFileNameWithoutExtension(file);
                    await MarkAudioAsDeletedAsync(poiCode);

                    result.DeletedFiles++;
                    result.FreedBytes += fileInfo.Length;
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[CLEANUP] Failed to delete {file}: {ex.Message}");
                    result.Errors++;
                }
            }

            result.EndTime = DateTime.UtcNow;
            result.Success = true;

            Debug.WriteLine($"[CLEANUP] Cleared all audio: {result.DeletedFiles} files, {result.FreedBytes / 1024 / 1024} MB");

            return result;
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[CLEANUP] Error clearing audio: {ex.Message}");
            result.Success = false;
            result.ErrorMessage = ex.Message;
            return result;
        }
    }
}

public class CleanupResult
{
    public bool Success { get; set; }
    public DateTime StartTime { get; set; }
    public DateTime? EndTime { get; set; }
    public int TotalFiles { get; set; }
    public int DeletedFiles { get; set; }
    public long TotalSizeBytes { get; set; }
    public long FreedBytes { get; set; }
    public int Errors { get; set; }
    public string ErrorMessage { get; set; }

    public TimeSpan Duration => EndTime.HasValue ? EndTime.Value - StartTime : TimeSpan.Zero;
}

public class StorageStats
{
    public int TotalFiles { get; set; }
    public long TotalSizeBytes { get; set; }
    public DateTime? OldestFileDate { get; set; }
    public DateTime? NewestFileDate { get; set; }
    public long AverageSizeBytes { get; set; }
    public int OldFilesCount { get; set; }
    public long OldFilesSizeBytes { get; set; }
    public long StorageLimitBytes { get; set; }
    public double StorageUsagePercent { get; set; }
    public bool IsNearLimit { get; set; }

    public string TotalSizeMB => $"{TotalSizeBytes / 1024.0 / 1024.0:F2} MB";
    public string FreedSizeMB => $"{OldFilesSizeBytes / 1024.0 / 1024.0:F2} MB";
    public string StorageLimitMB => $"{StorageLimitBytes / 1024.0 / 1024.0:F2} MB";
}
```

---

## 2. STORAGE SETTINGS UI

### 2.1 Settings Page Update

**File:** `Views/SettingsPage.xaml` (Add section)

```xml
<VerticalStackLayout Spacing="10" Padding="20">
    <!-- Existing settings... -->
    
    <!-- Storage Management Section -->
    <Label Text="Storage Management" FontSize="18" FontAttributes="Bold" Margin="0,20,0,10"/>
    
    <Frame BorderColor="{StaticResource Gray300}" Padding="15" CornerRadius="8">
        <VerticalStackLayout Spacing="10">
            <Label Text="{Binding StorageUsageText}" FontSize="14"/>
            <ProgressBar Progress="{Binding StorageUsagePercent}" ProgressColor="{Binding StorageProgressColor}"/>
            
            <Label Text="{Binding StorageDetailsText}" FontSize="12" TextColor="{StaticResource Gray600}"/>
            
            <Button Text="Clean Old Files" 
                    Command="{Binding CleanupOldFilesCommand}"
                    IsEnabled="{Binding CanCleanup}"
                    Margin="0,10,0,0"/>
            
            <Button Text="Clear All Audio" 
                    Command="{Binding ClearAllAudioCommand}"
                    BackgroundColor="{StaticResource Danger}"
                    TextColor="White"
                    Margin="0,5,0,0"/>
            
            <Label Text="⚠️ Clearing audio will require re-downloading when you visit POIs" 
                   FontSize="11" 
                   TextColor="{StaticResource Warning}"
                   IsVisible="{Binding ShowClearWarning}"/>
        </VerticalStackLayout>
    </Frame>
    
    <!-- Auto-cleanup Settings -->
    <Label Text="Auto-Cleanup" FontSize="16" FontAttributes="Bold" Margin="0,20,0,10"/>
    
    <Frame BorderColor="{StaticResource Gray300}" Padding="15" CornerRadius="8">
        <VerticalStackLayout Spacing="10">
            <HorizontalStackLayout Spacing="10">
                <Label Text="Enable auto-cleanup" VerticalOptions="Center" HorizontalOptions="FillAndExpand"/>
                <Switch IsToggled="{Binding AutoCleanupEnabled}" OnColor="{StaticResource Primary}"/>
            </HorizontalStackLayout>
            
            <Label Text="Automatically delete audio files not accessed in 30 days" 
                   FontSize="12" 
                   TextColor="{StaticResource Gray600}"/>
        </VerticalStackLayout>
    </Frame>
</VerticalStackLayout>
```

### 2.2 Settings ViewModel Update

**File:** `ViewModels/SettingsViewModel.cs` (Add properties and commands)

```csharp
public partial class SettingsViewModel : ObservableObject
{
    private readonly StorageCleanupService _cleanupService;
    
    [ObservableProperty]
    private string storageUsageText;
    
    [ObservableProperty]
    private double storageUsagePercent;
    
    [ObservableProperty]
    private Color storageProgressColor;
    
    [ObservableProperty]
    private string storageDetailsText;
    
    [ObservableProperty]
    private bool canCleanup;
    
    [ObservableProperty]
    private bool showClearWarning;
    
    [ObservableProperty]
    private bool autoCleanupEnabled;

    public SettingsViewModel(StorageCleanupService cleanupService)
    {
        _cleanupService = cleanupService;
        
        // Load auto-cleanup preference
        AutoCleanupEnabled = Preferences.Default.Get("auto_cleanup_enabled", true);
        
        _ = LoadStorageStatsAsync();
    }

    private async Task LoadStorageStatsAsync()
    {
        var stats = await _cleanupService.GetStorageStatsAsync();
        
        StorageUsageText = $"Storage: {stats.TotalSizeMB} / {stats.StorageLimitMB}";
        StorageUsagePercent = stats.StorageUsagePercent / 100.0;
        StorageDetailsText = $"{stats.TotalFiles} files • {stats.OldFilesCount} old files ({stats.FreedSizeMB})";
        CanCleanup = stats.OldFilesCount > 0;
        
        // Color based on usage
        StorageProgressColor = stats.StorageUsagePercent switch
        {
            < 50 => Colors.Green,
            < 80 => Colors.Orange,
            _ => Colors.Red
        };
    }

    [RelayCommand]
    private async Task CleanupOldFilesAsync()
    {
        var confirm = await Shell.Current.DisplayAlert(
            "Clean Old Files",
            "Delete audio files not accessed in 30 days? You can re-download them later.",
            "Clean",
            "Cancel"
        );

        if (!confirm) return;

        IsBusy = true;

        try
        {
            var result = await _cleanupService.CleanupOldAudioFilesAsync();
            
            if (result.Success)
            {
                await Shell.Current.DisplayAlert(
                    "Cleanup Complete",
                    $"Deleted {result.DeletedFiles} files\nFreed {result.FreedBytes / 1024 / 1024} MB",
                    "OK"
                );
                
                await LoadStorageStatsAsync();
            }
            else
            {
                await Shell.Current.DisplayAlert("Error", result.ErrorMessage, "OK");
            }
        }
        finally
        {
            IsBusy = false;
        }
    }

    [RelayCommand]
    private async Task ClearAllAudioAsync()
    {
        ShowClearWarning = true;
        
        var confirm = await Shell.Current.DisplayAlert(
            "Clear All Audio",
            "Delete ALL downloaded audio files? This cannot be undone.",
            "Clear All",
            "Cancel"
        );

        ShowClearWarning = false;

        if (!confirm) return;

        IsBusy = true;

        try
        {
            var result = await _cleanupService.ClearAllAudioAsync();
            
            if (result.Success)
            {
                await Shell.Current.DisplayAlert(
                    "Cleared",
                    $"Deleted {result.DeletedFiles} files\nFreed {result.FreedBytes / 1024 / 1024} MB",
                    "OK"
                );
                
                await LoadStorageStatsAsync();
            }
            else
            {
                await Shell.Current.DisplayAlert("Error", result.ErrorMessage, "OK");
            }
        }
        finally
        {
            IsBusy = false;
        }
    }

    partial void OnAutoCleanupEnabledChanged(bool value)
    {
        Preferences.Default.Set("auto_cleanup_enabled", value);
    }
}
```

---

## 3. LOW STORAGE WARNING

### 3.1 Storage Monitor Service

**File:** `Services/StorageMonitorService.cs` (NEW)

```csharp
using System.Diagnostics;

namespace MauiApp1.Services;

public class StorageMonitorService
{
    private readonly StorageCleanupService _cleanupService;
    private const double WarningThresholdPercent = 80.0;
    private const double CriticalThresholdPercent = 95.0;
    private DateTime _lastWarningShown = DateTime.MinValue;
    private const int WarningCooldownMinutes = 60;

    public StorageMonitorService(StorageCleanupService cleanupService)
    {
        _cleanupService = cleanupService;
    }

    /// <summary>
    /// Check storage and show warning if needed
    /// </summary>
    public async Task CheckStorageAndWarnAsync()
    {
        var stats = await _cleanupService.GetStorageStatsAsync();

        // Critical: Auto-cleanup
        if (stats.StorageUsagePercent >= CriticalThresholdPercent)
        {
            Debug.WriteLine("[STORAGE-MONITOR] Critical storage level, auto-cleaning");
            await _cleanupService.CleanupByStorageLimitAsync();
            return;
        }

        // Warning: Show notification
        if (stats.StorageUsagePercent >= WarningThresholdPercent)
        {
            var timeSinceLastWarning = DateTime.UtcNow - _lastWarningShown;
            
            if (timeSinceLastWarning.TotalMinutes >= WarningCooldownMinutes)
            {
                await ShowStorageWarningAsync(stats);
                _lastWarningShown = DateTime.UtcNow;
            }
        }
    }

    private async Task ShowStorageWarningAsync(StorageStats stats)
    {
        var result = await Shell.Current.DisplayAlert(
            "Storage Almost Full",
            $"Audio storage is at {stats.StorageUsagePercent:F0}% ({stats.TotalSizeMB} / {stats.StorageLimitMB})\n\n" +
            $"Clean {stats.OldFilesCount} old files to free {stats.FreedSizeMB}?",
            "Clean Now",
            "Later"
        );

        if (result)
        {
            await _cleanupService.CleanupOldAudioFilesAsync();
        }
    }
}
```

### 3.2 Integration with Download Queue

**File:** `Services/DownloadQueueService.cs` (Update)

```csharp
// Add field
private readonly StorageMonitorService _storageMonitor;

// Update constructor
public DownloadQueueService(HttpClient httpClient, StorageMonitorService storageMonitor)
{
    // ... existing code ...
    _storageMonitor = storageMonitor;
}

// Add check before download
private async Task DownloadItemAsync(DownloadQueueItem item)
{
    // Check storage before download
    await _storageMonitor.CheckStorageAndWarnAsync();
    
    // ... rest of existing code ...
}
```

---

## 4. BACKEND AUDIO METADATA API

### 4.1 Add Audio URL to POI Response

**File:** `backend/src/services/poi.service.js`

```javascript
// Update mapPoiDto method (line 90-114)
mapPoiDto(poi, lang) {
    const viContent = this._extractViContent(poi);
    const normalizedContent = { vi: viContent };
    const legacyByLang = { vi: this._pickDisplayText(viContent), en: '' };

    return {
        id: poi._id,
        code: poi.code,
        location: {
            lat: poi.location.coordinates[1],
            lng: poi.location.coordinates[0]
        },
        radius: Number(poi.radius || 100),
        priority: Number(poi.priority || 0),
        languageCode: String(poi.languageCode || 'vi').toLowerCase(),
        name: viContent.name,
        summary: viContent.summary,
        narrationShort: viContent.narrationShort,
        narrationLong: viContent.narrationLong,
        content: this._pickDisplayText(viContent),
        contentByLang: legacyByLang,
        localizedContent: normalizedContent,
        isPremiumOnly: poi.isPremiumOnly,
        audioUrl: poi.audioUrl || null, // NEW: Add audio URL
        audioSizeBytes: poi.audioSizeBytes || null // NEW: Add audio size
    };
}
```

**File:** `backend/src/models/poi.model.js`

```javascript
// Add fields (line 28)
audioUrl: { type: String, default: null },
audioSizeBytes: { type: Number, default: null },
```

---

## 5. TESTING CHECKLIST

### 5.1 Cleanup Tests

```csharp
[Test]
public async Task Cleanup_OldFiles_DeletesCorrectly()
{
    var cleanup = new StorageCleanupService();
    
    // Create test files with old timestamps
    var testFile = Path.Combine(FileSystem.AppDataDirectory, "audio", "TEST_OLD.mp3");
    File.WriteAllText(testFile, "test");
    File.SetLastAccessTime(testFile, DateTime.UtcNow.AddDays(-31));
    
    var result = await cleanup.CleanupOldAudioFilesAsync();
    
    Assert.IsTrue(result.Success);
    Assert.AreEqual(1, result.DeletedFiles);
    Assert.IsFalse(File.Exists(testFile));
}

[Test]
public async Task Cleanup_StorageLimit_DeletesOldestFirst()
{
    var cleanup = new StorageCleanupService();
    
    // Create multiple files
    // ... test logic ...
    
    var result = await cleanup.CleanupByStorageLimitAsync();
    
    Assert.IsTrue(result.Success);
    Assert.Greater(result.DeletedFiles, 0);
}
```

### 5.2 Storage Monitor Tests

```csharp
[Test]
public async Task StorageMonitor_CriticalLevel_AutoCleans()
{
    var monitor = new StorageMonitorService(_cleanupService);
    
    // Fill storage to critical level
    // ... test logic ...
    
    await monitor.CheckStorageAndWarnAsync();
    
    var stats = await _cleanupService.GetStorageStatsAsync();
    Assert.Less(stats.StorageUsagePercent, 95.0);
}
```

---

## 6. DEPLOYMENT STEPS

### 6.1 Pre-Deployment

1. Test cleanup on devices with various storage states
2. Verify no data corruption
3. Test storage warning UI

### 6.2 Deployment

1. Deploy storage cleanup service
2. Enable auto-cleanup by default
3. Monitor crash reports

### 6.3 Post-Deployment

1. Monitor storage usage metrics
2. Check cleanup success rate
3. Gather user feedback on storage warnings

---

## 7. SUCCESS METRICS

- ✅ Storage stays under 500 MB limit
- ✅ Old files cleaned within 7 days
- ✅ No user complaints about storage full
- ✅ Cleanup runs successfully 99%+ of time
- ✅ Re-download works after cleanup

---

## 8. USER COMMUNICATION

**In-App Message:**
```
🧹 Storage Management

We automatically clean audio files not accessed in 30 days to save space.

You can always re-download them when you visit a POI.

Manage storage in Settings > Storage Management
```

---

**Implementation Status:** READY  
**Estimated Time:** 3-4 days  
**Risk Level:** LOW (non-destructive, user can disable)
