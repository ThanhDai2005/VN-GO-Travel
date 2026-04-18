using MauiApp1.Models;

namespace MauiApp1.Services;

public interface IEventBatchSink
{
    Task SendBatchAsync(IReadOnlyList<TranslationEvent> events, CancellationToken cancellationToken = default);
}
