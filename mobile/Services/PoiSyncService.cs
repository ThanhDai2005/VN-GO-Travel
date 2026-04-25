using System;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace VNGOTravel.Services
{
    /// <summary>
    /// POI Content Sync Service
    /// Checks for updated POIs from backend and triggers re-download
    /// </summary>
    public class PoiSyncService
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<PoiSyncService> _logger;
        private readonly string _lastSyncKey = "poi_last_sync_time";

        public PoiSyncService(HttpClient httpClient, ILogger<PoiSyncService> logger)
        {
            _httpClient = httpClient;
            _logger = logger;
        }

        /// <summary>
        /// Check if there are POI updates available
        /// </summary>
        public async Task<SyncCheckResult> CheckForUpdatesAsync()
        {
            try
            {
                var lastSyncTime = await GetLastSyncTimeAsync();
                var url = $"/api/v1/pois/check-sync?lastSyncTime={Uri.EscapeDataString(lastSyncTime)}";

                var response = await _httpClient.GetAsync(url);
                response.EnsureSuccessStatusCode();

                var result = await response.Content.ReadFromJsonAsync<ApiResponse<SyncData>>();

                if (result?.Success == true && result.Data != null)
                {
                    return new SyncCheckResult
                    {
                        HasUpdates = result.Data.HasUpdates,
                        UpdatedPois = result.Data.UpdatedPois,
                        DeletedPois = result.Data.DeletedPois,
                        ServerTime = result.Data.ServerTime
                    };
                }

                return new SyncCheckResult { HasUpdates = false };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[PoiSyncService] Failed to check for updates");
                return new SyncCheckResult { HasUpdates = false, Error = ex.Message };
            }
        }

        /// <summary>
        /// Mark sync as completed with current server time
        /// </summary>
        public async Task MarkSyncCompletedAsync(string serverTime)
        {
            try
            {
                await SecureStorage.SetAsync(_lastSyncKey, serverTime);
                _logger.LogInformation($"[PoiSyncService] Sync completed at {serverTime}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[PoiSyncService] Failed to save sync time");
            }
        }

        /// <summary>
        /// Get last sync time from secure storage
        /// </summary>
        private async Task<string> GetLastSyncTimeAsync()
        {
            try
            {
                var lastSync = await SecureStorage.GetAsync(_lastSyncKey);
                return lastSync ?? DateTime.UtcNow.AddDays(-30).ToString("o"); // Default: 30 days ago
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[PoiSyncService] Failed to get last sync time");
                return DateTime.UtcNow.AddDays(-30).ToString("o");
            }
        }

        /// <summary>
        /// Reset sync state (force full re-sync)
        /// </summary>
        public async Task ResetSyncStateAsync()
        {
            try
            {
                SecureStorage.Remove(_lastSyncKey);
                _logger.LogInformation("[PoiSyncService] Sync state reset");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[PoiSyncService] Failed to reset sync state");
            }
        }
    }

    #region DTOs

    public class SyncCheckResult
    {
        public bool HasUpdates { get; set; }
        public PoiSyncInfo[] UpdatedPois { get; set; } = Array.Empty<PoiSyncInfo>();
        public PoiSyncInfo[] DeletedPois { get; set; } = Array.Empty<PoiSyncInfo>();
        public string ServerTime { get; set; }
        public string Error { get; set; }
    }

    public class SyncData
    {
        public bool HasUpdates { get; set; }
        public PoiSyncInfo[] UpdatedPois { get; set; }
        public PoiSyncInfo[] DeletedPois { get; set; }
        public string ServerTime { get; set; }
    }

    public class PoiSyncInfo
    {
        public string Code { get; set; }
        public DateTime UpdatedAt { get; set; }
        public DateTime? DeletedAt { get; set; }
    }

    public class ApiResponse<T>
    {
        public bool Success { get; set; }
        public T Data { get; set; }
    }

    #endregion
}
