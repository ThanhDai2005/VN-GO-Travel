using MauiApp1.Services;
using MauiApp1.Views;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Maui.Controls.Maps;
using ZXing.Net.Maui;
using ZXing.Net.Maui.Controls;
namespace MauiApp1;

public static class MauiProgram
{
    public static MauiApp CreateMauiApp()
    {
        SQLitePCL.Batteries_V2.Init();

        var builder = MauiApp.CreateBuilder();
        builder
            .UseMauiApp<App>()
            .UseBarcodeReader()
            .UseMauiMaps()
            .ConfigureFonts(fonts =>
            {
                fonts.AddFont("OpenSans-Regular.ttf", "OpenSansRegular");
                fonts.AddFont("OpenSans-Semibold.ttf", "OpenSansSemibold");
            });

#if DEBUG
        builder.Logging.AddDebug();
#endif

        builder.Services.AddSingleton<PoiDatabase>();
        builder.Services.AddSingleton<IPreferredLanguageService, PreferredLanguageService>();
        builder.Services.AddSingleton<LocalizationService>();
        builder.Services.AddSingleton<GTranslateTranslationProvider>();
        builder.Services.AddSingleton<ITranslationProvider, LangblyTranslationProvider>();
        // PoiTranslationService is now used again for dynamic text generation.
        builder.Services.AddSingleton<IPoiTranslationService, PoiTranslationService>();
        builder.Services.AddSingleton<PoiEntryCoordinator>();
        builder.Services.AddSingleton<CurrentPoiStore>();
        builder.Services.AddSingleton<DeepLinkHandler>();
        builder.Services.AddSingleton<PendingDeepLinkStore>();
        builder.Services.AddSingleton<DeepLinkCoordinator>();
        builder.Services.AddSingleton<LocationService>();
        builder.Services.AddSingleton<AudioService>();
        builder.Services.AddSingleton<GeofenceService>();
        builder.Services.AddSingleton<ViewModels.MapViewModel>();
        builder.Services.AddSingleton<LanguagePackService>();

        builder.Services.AddSingleton<AppShell>();

        builder.Services.AddTransient<ExplorePage>();
        builder.Services.AddTransient<AboutPage>();
        builder.Services.AddTransient<MapPage>();
        builder.Services.AddTransient<LanguageSelectorPage>();
        builder.Services.AddTransient<ViewModels.LanguageSelectorViewModel>();
        
        builder.Services.AddTransient<Views.AddLanguagePage>();
        builder.Services.AddTransient<ViewModels.AddLanguageViewModel>();

        // QR pages and viewmodels for Phase-1A
        builder.Services.AddTransient<QrScannerPage>();
        builder.Services.AddTransient<ViewModels.QrScannerViewModel>();
        builder.Services.AddTransient<PoiDetailPage>();
        builder.Services.AddTransient<ViewModels.PoiDetailViewModel>();

        return builder.Build();
    }
}