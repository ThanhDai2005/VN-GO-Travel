using System;
using Microsoft.Extensions.Logging;

namespace MauiApp1.Services;

public interface IQuotaGuardService
{
    bool TryConsumeQuota();
}

/// <summary>
/// Implements 3-layer quota protection (User, Device, Global).
/// </summary>
public class QuotaGuardService : IQuotaGuardService
{
    private readonly ILogger<QuotaGuardService> _logger;
    
    // In a real app, these would be persisted or fetched from a server.
    // For this implementation, we use in-memory counters as a stand-in.
    private int _dailyUserCount = 0;
    private int _dailyDeviceCount = 0;
    private int _globalMinuteCount = 0;
    
    private DateTime _lastDailyReset = DateTime.UtcNow.Date;
    private DateTime _lastMinuteReset = DateTime.UtcNow;

    public QuotaGuardService(ILogger<QuotaGuardService> logger)
    {
        _logger = logger;
    }

    public bool TryConsumeQuota()
    {
        lock (this)
        {
            DateTime now = DateTime.UtcNow;

            // Reset Daily
            if (now.Date > _lastDailyReset)
            {
                _dailyUserCount = 0;
                _dailyDeviceCount = 0;
                _lastDailyReset = now.Date;
            }

            // Reset Minute
            if ((now - _lastMinuteReset).TotalSeconds >= 60)
            {
                _globalMinuteCount = 0;
                _lastMinuteReset = now;
            }

            // 4.1 Implement 3-layer quota:
            if (_dailyUserCount >= 50) return Block("user_daily");
            if (_dailyDeviceCount >= 30) return Block("device_daily");
            if (_globalMinuteCount >= 100) return Block("global_minute");

            // Consume
            _dailyUserCount++;
            _dailyDeviceCount++;
            _globalMinuteCount++;

            return true;
        }
    }

    private bool Block(string reason)
    {
        // 4.3 Log event
        _logger.LogWarning("JIT_QUOTA_BLOCKED | level: warning | reason: {Reason}", reason);
        return false;
    }
}
