namespace MauiApp1.Messages;

public record AudioDownloadProgressMessage(
    string EventType,
    string ZoneCode,
    int CompletedPois,
    int TotalPois,
    double Progress,
    string? Error = null);
