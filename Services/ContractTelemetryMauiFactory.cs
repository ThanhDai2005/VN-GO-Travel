using ContractObservability;
using MauiApp1.Models;

namespace MauiApp1.Services;

/// <summary>Maps MAUI <see cref="TranslationEvent"/> to contract telemetry wire samples (6.7.5).</summary>
public static class ContractTelemetryMauiFactory
{
    public static ContractTelemetryWireSample FromTranslationEvent(TranslationEvent e, string sourceLabel = "maui")
    {
        return new ContractTelemetryWireSample
        {
            ContractVersion = e.ContractVersion,
            EventId = e.EventId,
            RequestId = e.RequestId,
            SessionId = e.SessionId,
            PoiCode = e.PoiCode,
            Language = e.Language,
            UserTypeWire = TelemetryEnumWire.UserTier(e.UserType),
            UserId = e.UserId,
            DeviceId = e.DeviceId,
            Status = e.StatusSnake,
            DurationMs = e.DurationMs,
            Timestamp = e.Timestamp,
            Source = e.Source,
            ActionTypeWire = TelemetryEnumWire.EventAction(e.ActionType),
            NetworkType = e.NetworkType,
            UserApproved = e.UserApproved,
            FetchTriggered = e.FetchTriggered,
            Latitude = e.Latitude,
            Longitude = e.Longitude,
            GeoRadiusMeters = e.GeoRadiusMeters,
            GeoSourceWire = TelemetryEnumWire.EventGeo(e.GeoSource),
            BatchItemCount = e.BatchItemCount,
            SourceLabel = sourceLabel,
            IngestionRejected = false
        };
    }
}
