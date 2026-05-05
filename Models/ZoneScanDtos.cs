namespace MauiApp1.Models;

/// <summary>POST /api/v1/zones/scan response envelope.</summary>
public sealed class ZoneScanApiResponse
{
    public bool Success { get; set; }
    public ZoneScanData? Data { get; set; }
}

public sealed class ZoneScanData
{
    public ZoneInfo? Zone { get; set; }
    public List<ZonePoiData>? Pois { get; set; }
    public ZoneAccessStatus? AccessStatus { get; set; }
}

public sealed class ZoneInfo
{
    public string? Id { get; set; }
    public string? Code { get; set; }
    public string? Name { get; set; }
    public string? Description { get; set; }
    public int Price { get; set; }
    public int PoiCount { get; set; }
    public string? ImageUrl { get; set; }
    public List<string>? Tags { get; set; }
}

public sealed class ZonePoiData
{
    public string? Id { get; set; }
    public string? Code { get; set; }
    public PoiScanLocation? Location { get; set; }
    public double Radius { get; set; }
    public int Priority { get; set; }
    public string? Name { get; set; }
    public string? Summary { get; set; }
    public string? NarrationShort { get; set; }
    public string? NarrationLong { get; set; }
    public PoiScanContent? Content { get; set; }
    public string? Status { get; set; }
    public AudioInfo? Audio { get; set; }
    public string? AudioUrl { get; set; }
}

public sealed class ZoneAccessStatus
{
    public bool HasAccess { get; set; }
    public bool RequiresPurchase { get; set; }
    public int Price { get; set; }
    public string? Reason { get; set; }
    public string? Message { get; set; }
}

public sealed class AudioInfo
{
    public string? Url { get; set; }
    public bool Ready { get; set; }
}
