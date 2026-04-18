using MauiApp1.Models;

namespace MauiApp1.Services;

public static class TranslationEventStatusNormalizer
{
    public static string ToSnake(TranslationEventStatus status) =>
        status switch
        {
            TranslationEventStatus.Requested => "requested",
            TranslationEventStatus.DedupHit => "dedup_hit",
            TranslationEventStatus.Success => "success",
            TranslationEventStatus.Failed => "failed",
            TranslationEventStatus.Exception => "exception",
            TranslationEventStatus.AppEvent => "app_event",
            _ => "requested"
        };

    public static TranslationEventStatus FromSnake(string? snake) =>
        snake switch
        {
            "requested" => TranslationEventStatus.Requested,
            "dedup_hit" => TranslationEventStatus.DedupHit,
            "success" => TranslationEventStatus.Success,
            "failed" => TranslationEventStatus.Failed,
            "exception" => TranslationEventStatus.Exception,
            "app_event" => TranslationEventStatus.AppEvent,
            _ => TranslationEventStatus.Requested
        };
}
