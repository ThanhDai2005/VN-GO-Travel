using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace MauiApp1.Services;

public interface IJitOptimizationService
{
    bool ShouldSkip(string text, string targetLang);
    bool IsCircuitOpen();
    void RecordSuccess();
    void RecordFailure();
}

public class JitOptimizationService : IJitOptimizationService
{
    private readonly ILogger<JitOptimizationService> _logger;
    
    // 2. CIRCUIT BREAKER
    private readonly ConcurrentQueue<(DateTime Timestamp, bool Success)> _rollingWindow = new();
    private DateTime? _circuitOpenUntil = null;
    private readonly object _breakerLock = new();

    public JitOptimizationService(ILogger<JitOptimizationService> logger)
    {
        _logger = logger;
    }

    public bool ShouldSkip(string text, string targetLang)
    {
        if (string.IsNullOrWhiteSpace(text) || text.Length < 3) return true;
        if (IsCircuitOpen())
        {
            _logger.LogWarning("JIT_SKIPPED | reason: circuit_breaker_open");
            return true;
        }
        return false;
    }

    public bool IsCircuitOpen()
    {
        lock (_breakerLock)
        {
            if (_circuitOpenUntil.HasValue)
            {
                if (DateTime.UtcNow < _circuitOpenUntil.Value) return true;
                
                // 2.3 Auto-reset
                _logger.LogInformation("JIT_CIRCUIT_BREAKER_RESET | Circuit closed.");
                _circuitOpenUntil = null;
            }
        }
        return false;
    }

    public void RecordSuccess() => RecordResult(true);
    public void RecordFailure() => RecordResult(false);

    private void RecordResult(bool success)
    {
        DateTime now = DateTime.UtcNow;
        _rollingWindow.Enqueue((now, success));

        // Clean up old entries (> 1 min)
        while (_rollingWindow.TryPeek(out var first) && (now - first.Timestamp).TotalSeconds > 60)
        {
            _rollingWindow.TryDequeue(out _);
        }

        // 2.1 Calculate failure rate
        var snapshot = _rollingWindow.ToList();
        if (snapshot.Count >= 10) // Minimum threshold to avoid premature tripping
        {
            double failures = snapshot.Count(r => !r.Success);
            double rate = failures / snapshot.Count;

            if (rate > 0.5)
            {
                lock (_breakerLock)
                {
                    if (!_circuitOpenUntil.HasValue)
                    {
                        // 2.2 Trigger breaker for 2 minutes
                        _circuitOpenUntil = now.AddMinutes(2);
                        _logger.LogError("JIT_CIRCUIT_BREAKER_ACTIVATED | failureRate: {Rate:P2} | JIT disabled for 2 minutes", rate);
                    }
                }
            }
        }
    }
}
