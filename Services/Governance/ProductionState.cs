namespace MauiApp1.Services.Governance;

/// <summary>PCGL (7.2.8) — formal production readiness outcome from <see cref="ProductionReadinessEvaluator"/>.</summary>
public enum ProductionState
{
    /// <summary>All governance checks within acceptable bounds.</summary>
    Ready = 0,

    /// <summary>Observable stress or anomalies; requires review before wide rollout.</summary>
    Degraded = 1,

    /// <summary>Invariant or certification failure — must not ship until resolved.</summary>
    Blocked = 2,
}
