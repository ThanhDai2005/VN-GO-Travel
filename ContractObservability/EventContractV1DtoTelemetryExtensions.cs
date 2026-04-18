using GeneratedContract;

namespace ContractObservability;

public static class EventContractV1DtoTelemetryExtensions
{
    public static ContractTelemetryWireSample ToContractTelemetryWireSample(
        this EventContractV1Dto dto,
        string sourceLabel,
        bool ingestionRejected)
    {
        return new ContractTelemetryWireSample
        {
            ContractVersion = dto.ContractVersion,
            EventId = dto.EventId,
            RequestId = dto.RequestId,
            SessionId = dto.SessionId,
            PoiCode = dto.PoiCode,
            Language = dto.Language,
            UserTypeWire = TelemetryEnumWire.UserTier(dto.UserType),
            UserId = dto.UserId,
            DeviceId = dto.DeviceId,
            Status = dto.Status,
            DurationMs = dto.DurationMs,
            Timestamp = dto.Timestamp,
            Source = dto.Source,
            ActionTypeWire = TelemetryEnumWire.EventAction(dto.ActionType),
            NetworkType = dto.NetworkType,
            UserApproved = dto.UserApproved,
            FetchTriggered = dto.FetchTriggered,
            Latitude = dto.Latitude,
            Longitude = dto.Longitude,
            GeoRadiusMeters = dto.GeoRadiusMeters,
            GeoSourceWire = TelemetryEnumWire.EventGeo(dto.GeoSource),
            BatchItemCount = dto.BatchItemCount,
            SourceLabel = sourceLabel,
            IngestionRejected = ingestionRejected
        };
    }
}
