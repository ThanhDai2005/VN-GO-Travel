namespace MauiApp1.Models;

public class ZoneAccessState
{
    public string ZoneId { get; set; } = string.Empty;
    public bool HasAccess { get; set; }
    public bool IsDownloaded { get; set; }
    public DateTime? LastSyncedAt { get; set; }
}
