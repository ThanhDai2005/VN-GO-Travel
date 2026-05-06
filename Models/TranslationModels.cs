using System;
using System.Collections.Generic;

namespace MauiApp1.Models;

public class PoiTranslationDto
{
    public string lang_code { get; set; } = "";
    public string mode { get; set; } = "partial"; // full, partial
    public string translationSource { get; set; } = "manual"; // manual, jit_en, jit_vi
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

public class ResolvedPoiContent
{
    public string Name { get; set; } = "";
    public string Summary { get; set; } = "";
    public string NarrationShort { get; set; } = "";
    public string NarrationLong { get; set; } = "";
    public string SourceType { get; set; } = ""; // manual, jit_en, jit_vi, base
    public bool IsFallback { get; set; }
    public double ConfidenceScore { get; set; }
    public bool ShowBadgeAutoTranslated { get; set; }
    public bool ShowBadgeOutdated { get; set; }
    
    // UI Signal Flags
    public bool UsedManual { get; set; }
    public bool UsedJitEn { get; set; }
    public bool UsedJitVi { get; set; }
    public bool UsedOutdated { get; set; }
    public bool UsedMixedSources { get; set; }
    public string DominantSource { get; set; } = "";
}

public class PoiDto
{
    public string Id { get; set; } = "";
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string Summary { get; set; } = "";
    public string NarrationShort { get; set; } = "";
    public string NarrationLong { get; set; } = "";
    public string LanguageCode { get; set; } = "vi";
    public int Version { get; set; } = 1;
    public List<PoiTranslationDto>? Translations { get; set; }
}
