using Microsoft.Extensions.Hosting;

namespace ContractObservability;

/// <summary>Ensures the telemetry channel consumer is running for ASP.NET Core hosts.</summary>
public sealed class ContractTelemetryHostedService : IHostedService
{
    private readonly ContractTelemetryTracker _tracker;

    public ContractTelemetryHostedService(ContractTelemetryTracker tracker) =>
        _tracker = tracker;

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _tracker.EnsureStarted();
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
