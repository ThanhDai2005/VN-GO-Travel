namespace TranslationEvents.Api.Services;

public sealed class EventValidationService
{
    public (IReadOnlyList<EventContractV1Dto> Valid, IReadOnlyList<(EventContractV1Dto Dto, string Reason)> Invalid) Partition(
        IReadOnlyList<EventContractV1Dto>? events)
    {
        if (events == null || events.Count == 0)
            return (Array.Empty<EventContractV1Dto>(), Array.Empty<(EventContractV1Dto, string)>());

        var valid = new List<EventContractV1Dto>();
        var invalid = new List<(EventContractV1Dto, string)>();

        foreach (var e in events)
        {
            var reason = EventContractValidator.GetRejectReason(e);
            if (reason != null)
                invalid.Add((e, reason));
            else
                valid.Add(e);
        }

        return (valid, invalid);
    }
}
