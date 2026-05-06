using System;

namespace MauiApp1.Infrastructure.Remote.Dtos;

public class PoiDto
{
    public string Id { get; set; } = "";
    public string Code { get; set; } = "";
    public double Lat { get; set; }
    public double Lng { get; set; }
    public int Priority { get; set; }
    public double Radius { get; set; }
    
    // We can map these directly to Localization property in Domain Model
    public string LanguageCode { get; set; } = "";
    public string Name { get; set; } = "";
    public string Summary { get; set; } = "";
    public string NarrationShort { get; set; } = "";
    public string NarrationLong { get; set; } = "";
    public string? ZoneCode { get; set; }
    public string? ZoneName { get; set; }
    public AccessStatusDto? AccessStatus { get; set; }
    public int Version { get; set; } = 1;
    public List<PoiTranslationDto>? Translations { get; set; }
}

public class PoiTranslationDto
{
    public string lang_code { get; set; } = "";
    public string mode { get; set; } = "partial";
    public string translationSource { get; set; } = "manual";
    public PoiTranslationContentDto content { get; set; } = new();
    public PoiTranslationMetadataDto metadata { get; set; } = new();
}

public class PoiTranslationContentDto
{
    public string name { get; set; } = "";
    public string summary { get; set; } = "";
    public string narrationShort { get; set; } = "";
    public string narrationLong { get; set; } = "";
}

public class PoiTranslationMetadataDto
{
    public bool isComplete { get; set; }
    public bool isOutdated { get; set; }
    public int baseVersion { get; set; }
    public int translatedVersion { get; set; }
    public double confidenceScore { get; set; } = 1.0;
    public DateTime updatedAt { get; set; }
}

public class AccessStatusDto
{
    public bool Allowed { get; set; }
    public string? Reason { get; set; }
    public string? Message { get; set; }
    public double Price { get; set; }
}

public class AuthDto
{
    public string Token { get; set; } = "";
    public string UserId { get; set; } = "";
}
