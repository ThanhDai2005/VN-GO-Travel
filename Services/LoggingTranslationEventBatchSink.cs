using System.Text.Json;
using MauiApp1.Models;
using Microsoft.Extensions.Logging;

namespace MauiApp1.Services;

public sealed class LoggingTranslationEventBatchSink : IEventBatchSink
{
    private static readonly JsonSerializerOptions JsonOpts = TranslationEventJsonOptions.Create();
    private readonly ILogger<LoggingTranslationEventBatchSink> _logger;

    public LoggingTranslationEventBatchSink(ILogger<LoggingTranslationEventBatchSink> logger)
    {
        _logger = logger;
    }

    public Task SendBatchAsync(IReadOnlyList<TranslationEvent> events, CancellationToken cancellationToken = default)
    {
        foreach (var e in events)
        {
            _logger.LogInformation(
                "[TranslationEventBatch] {Payload}",
                JsonSerializer.Serialize(e, JsonOpts));
        }

        return Task.CompletedTask;
    }
}
