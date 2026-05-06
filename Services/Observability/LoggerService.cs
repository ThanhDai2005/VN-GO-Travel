using Microsoft.Extensions.Logging;
using MauiApp1.ApplicationContracts.Services;

namespace MauiApp1.Services.Observability;

public sealed class LoggerService : ILoggerService
{
    private readonly ILogger<LoggerService> _logger;

    public LoggerService(ILogger<LoggerService> logger)
    {
        _logger = logger;
    }

    public void LogInfo(string @event, object? data = null)
    {
        var json = data != null ? System.Text.Json.JsonSerializer.Serialize(data) : "{}";
        _logger.LogInformation("[{Event}] {Data}", @event, json);
        System.Diagnostics.Debug.WriteLine($"[INFO][{@event}] {json}");
    }

    public void LogWarning(string @event, object? data = null)
    {
        var json = data != null ? System.Text.Json.JsonSerializer.Serialize(data) : "{}";
        _logger.LogWarning("[{Event}] {Data}", @event, json);
        System.Diagnostics.Debug.WriteLine($"[WARN][{@event}] {json}");
    }

    public void LogError(string @event, Exception? ex = null, object? data = null)
    {
        var json = data != null ? System.Text.Json.JsonSerializer.Serialize(data) : "{}";
        _logger.LogError(ex, "[{Event}] {Data}", @event, json);
        System.Diagnostics.Debug.WriteLine($"[ERROR][{@event}] {json} | {ex?.Message}");
    }
}
