namespace MauiApp1.Models;

/// <summary>POST /api/v1/pois/scan response envelope.</summary>
public sealed class PoiScanApiResponse
{
    public bool Success { get; set; }
    public PoiScanData? Data { get; set; }
}

public sealed class PoiScanData
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
}

public sealed class PoiScanLocation
{
    public double Lat { get; set; }
    public double Lng { get; set; }
}

public sealed class PoiScanContent
{
    public string? Vi { get; set; }
    public string? En { get; set; }
}
