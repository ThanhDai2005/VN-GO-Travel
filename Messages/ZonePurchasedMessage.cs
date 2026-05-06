namespace MauiApp1.Messages;

/// <summary>
/// Published immediately after a zone purchase is persisted locally.
/// </summary>
/// <param name="ZoneCode">Normalized purchased zone code.</param>
public record ZonePurchasedMessage(string ZoneCode);
