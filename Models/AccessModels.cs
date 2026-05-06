namespace MauiApp1.Models;

public enum AccessRenderState
{
    Unknown,
    Resolving,
    Unlocked,       // Purchased
    NotLoggedIn,
    NotPurchased,
    NotForSale      // No zone mapping found even after fallback
}

public sealed class AccessEvaluationResult
{
    public AccessRenderState State { get; init; }
    public string? ZoneCode { get; init; }
    public string? PoiCode { get; init; }
    public DateTime ResolvedAt { get; init; } = DateTime.UtcNow;
}
