namespace ContractObservability;

public interface IContractTelemetryTracker
{
    /// <summary>Non-blocking: drops samples when the channel is full.</summary>
    void TryRecord(ContractTelemetryWireSample sample);

    ContractFieldUsageReport BuildUsageReport();

    BreakingChangeRiskResult AnalyzeBreakingChangeRisk();

    ContractLifecycleDashboardModel BuildDashboardModel(IReadOnlyList<ContractLifecycleNote>? driftNotes = null);
}
