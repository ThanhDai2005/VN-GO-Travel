namespace MauiApp1.Services;

/// <summary>
/// One stable session id per app process (in-memory only).
/// </summary>
public sealed class TranslationTrackingSession
{
    public string SessionId { get; } = Guid.NewGuid().ToString("N");
}
