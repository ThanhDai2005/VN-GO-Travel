using System;
using SQLite;

namespace MauiApp1.Models.Entities;

[Table("zone_purchases")]
public class ZonePurchase
{
    [PrimaryKey]
    public string Id { get; set; } = string.Empty;

    [Indexed]
    public string UserId { get; set; } = string.Empty;

    [Indexed]
    public string ZoneId { get; set; } = string.Empty;

    public string PurchasedAt { get; set; } = string.Empty;

    public string Source { get; set; } = "App";

    public int IsSynced { get; set; } = 0;

    public int ServerVerified { get; set; } = 0;
}

[Table("zone_downloads")]
public class ZoneDownload
{
    [PrimaryKey]
    public string Id { get; set; } = string.Empty;

    public string ZoneId { get; set; } = string.Empty;

    public string DownloadedAt { get; set; } = string.Empty;

    public int IsComplete { get; set; } = 0;
}

[Table("downloaded_audio")]
public class DownloadedAudio
{
    [PrimaryKey]
    public string Id { get; set; } = string.Empty;

    [Indexed]
    public string ZoneId { get; set; } = string.Empty;

    [Indexed]
    public string PoiCode { get; set; } = string.Empty;

    [Indexed]
    public string Lang { get; set; } = "vi";

    public string AudioShortPath { get; set; } = string.Empty;

    public string AudioLongPath { get; set; } = string.Empty;

    /// <summary>manual | tts</summary>
    public string SourceType { get; set; } = "tts";

    public string DownloadedAt { get; set; } = DateTime.UtcNow.ToString("O");
}

[Table("sync_queue")]
public class SyncQueueEntry
{
    [PrimaryKey]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    [Indexed]
    public string EntityType { get; set; } = string.Empty;

    public string EntityId { get; set; } = string.Empty;

    public string Action { get; set; } = string.Empty;

    public string Payload { get; set; } = string.Empty;

    public string CreatedAt { get; set; } = DateTime.UtcNow.ToString("O");

    public int RetryCount { get; set; } = 0;
}
