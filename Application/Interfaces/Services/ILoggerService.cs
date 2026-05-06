using System;

namespace MauiApp1.ApplicationContracts.Services;

public interface ILoggerService
{
    void LogInfo(string @event, object? data = null);
    void LogWarning(string @event, object? data = null);
    void LogError(string @event, Exception? ex = null, object? data = null);
}
