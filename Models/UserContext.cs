namespace MauiApp1.Models;

public sealed class UserContext
{
    public EventUserTier UserType { get; init; }
    public string? UserId { get; init; }
    public string DeviceId { get; init; } = "";
}
