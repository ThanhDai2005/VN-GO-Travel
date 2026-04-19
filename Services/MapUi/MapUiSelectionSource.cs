namespace MauiApp1.Services.MapUi;

/// <summary>
/// Declares who requested a <see cref="MauiApp1.Models.Poi"/> selection change for MSAL (7.2.4).
/// Numeric value is arbitration priority (higher wins for cross-code conflicts; dedupe uses ordering).
/// </summary>
public enum MapUiSelectionSource : int
{
    /// <summary>Map tracking loop auto-pick when user is inside a POI radius.</summary>
    MapAutoProximity = 100,

    /// <summary>Narration / translation produced a new hydrated instance for the same code.</summary>
    NarrationSync = 160,

    /// <summary>Two-way binding or legacy call sites without a finer source.</summary>
    DataBindingOrUnknown = 250,

    /// <summary>Language switch re-hydrated the same selected code.</summary>
    LanguageRehydrate = 270,

    /// <summary>User tapped empty map / cleared selection.</summary>
    ManualMapBackgroundTap = 310,

    /// <summary>User tapped a map pin.</summary>
    ManualMapPinTap = 340,

    /// <summary>QR / deep link / shell query path resolved focus by code.</summary>
    PoiFocusFromQuery = 360,

    /// <summary>POI detail page finished loading and published the hydrated POI.</summary>
    PoiDetailPageLoad = 370,

    /// <summary>Secure or plain QR entry coordinator pre-navigation hint.</summary>
    CoordinatorQrOrDeepLink = 400,
}
