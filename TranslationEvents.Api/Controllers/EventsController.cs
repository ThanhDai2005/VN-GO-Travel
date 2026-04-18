using System.Text.Json;
using ContractObservability;
using ContractObservability.Replay;
using Microsoft.AspNetCore.Mvc;
using TranslationEvents.Api.Models;
using TranslationEvents.Api.Services;

namespace TranslationEvents.Api.Controllers;

[ApiController]
[Route("events")]
public sealed class EventsController : ControllerBase
{
    private readonly EventValidationService _validation;
    private readonly ILogger<EventsController> _logger;
    private readonly ContractTelemetryTracker _telemetry;
    private readonly IContractReplayCapture _replayCapture;

    public EventsController(
        EventValidationService validation,
        ILogger<EventsController> logger,
        ContractTelemetryTracker telemetry,
        IContractReplayCapture replayCapture)
    {
        _validation = validation;
        _logger = logger;
        _telemetry = telemetry;
        _replayCapture = replayCapture;
    }

    [HttpPost]
    [Consumes("application/json")]
    [Produces("application/json")]
    [ProducesResponseType(typeof(EventBatchResponse), StatusCodes.Status200OK)]
    public Task<ActionResult<EventBatchResponse>> PostAsync([FromBody] List<EventContractV1Dto>? body)
    {
        var received = body?.Count ?? 0;
        var (valid, invalid) = _validation.Partition(body ?? new List<EventContractV1Dto>());

        foreach (var (dto, reason) in invalid)
        {
            var rejectedSample = dto.ToContractTelemetryWireSample("api", ingestionRejected: true);
            _telemetry.TryRecord(rejectedSample);
            if (_replayCapture.IsEnabled)
            {
                var json = JsonSerializer.Serialize(dto, ContractReplaySerialization.ApiWireSnapshot);
                _replayCapture.TryCapture("api_invalid", json, rejectedSample.Clone());
            }

            _logger.LogWarning(
                "TranslationEvent rejected: {Reason} | contractVersion={ContractVersion} | eventId={EventId} | actionType={ActionType} | poiCode={PoiCode} | deviceId={DeviceId}",
                reason,
                dto.ContractVersion,
                dto.EventId,
                dto.ActionType,
                dto.PoiCode,
                dto.DeviceId);
        }

        foreach (var dto in valid)
        {
            var acceptedSample = dto.ToContractTelemetryWireSample("api", ingestionRejected: false);
            _telemetry.TryRecord(acceptedSample);
            if (_replayCapture.IsEnabled)
            {
                var json = JsonSerializer.Serialize(dto, ContractReplaySerialization.ApiWireSnapshot);
                _replayCapture.TryCapture("api", json, acceptedSample.Clone());
            }
        }

        _logger.LogInformation(
            "TranslationEvent batch: received={Received} accepted={Accepted} rejected={Rejected}",
            received,
            valid.Count,
            invalid.Count);

        var response = new EventBatchResponse
        {
            Received = received,
            Accepted = valid.Count,
            Rejected = invalid.Count
        };

        return Task.FromResult<ActionResult<EventBatchResponse>>(Ok(response));
    }
}
