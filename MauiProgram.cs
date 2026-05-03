using ContractObservability.Replay;
using MauiApp1.ApplicationContracts.Providers;
using MauiApp1.ApplicationContracts.Repositories;
using MauiApp1.ApplicationContracts.Services;
using MauiApp1.Configuration;
using MauiApp1.Services;
using MauiApp1.Services.MapUi;
using MauiApp1.Services.Chaos;
using MauiApp1.Services.Governance;
using MauiApp1.Services.Observability;
using MauiApp1.Services.RBEL;
using MauiApp1.ViewModels;
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

        // ── DATA SOURCES SWITCHING (STAGE 6) ──
        bool useApiBackend = false; // Toggle this to switch to API backend

        // 1. Register Local Repository
        builder.Services.AddSingleton<PoiDatabase>();

        // 2. Register Remote API Repository
        builder.Services.AddSingleton<MauiApp1.Infrastructure.Remote.IApiClient, MauiApp1.Infrastructure.Remote.ApiClient>();
        builder.Services.AddSingleton<MauiApp1.Infrastructure.Remote.Repositories.PoiApiRepository>();

        // 3. Switch implementation for Query Repository based on configuration
        if (useApiBackend)
        {
            builder.Services.AddSingleton<IPoiQueryRepository>(sp => sp.GetRequiredService<MauiApp1.Infrastructure.Remote.Repositories.PoiApiRepository>());
        }
        else
        {
            builder.Services.AddSingleton<IPoiQueryRepository>(sp => sp.GetRequiredService<PoiDatabase>());
        }

        // Keep Command and Translation repositories on local (PoiDatabase) for now
        builder.Services.AddSingleton<IPoiCommandRepository>(sp => sp.GetRequiredService<PoiDatabase>());
        builder.Services.AddSingleton<ITranslationRepository>(sp => sp.GetRequiredService<PoiDatabase>());

        builder.Services.AddSingleton<IPreferredLanguageService, PreferredLanguageService>();
        builder.Services.AddSingleton<LocalizationService>();
        builder.Services.AddSingleton<ILocalizationService>(sp => sp.GetRequiredService<LocalizationService>());

        builder.Services.AddSingleton<GTranslateTranslationProvider>();
        builder.Services.AddSingleton<ITranslationProvider, LangblyTranslationProvider>();
        builder.Services.AddSingleton<IPoiTranslationService, PoiTranslationService>();
        builder.Services.AddSingleton<TranslationQueueService>();
        builder.Services.AddSingleton<TranslationOrchestrator>();

        builder.Services.AddSingleton<QrScannerService>();
        builder.Services.AddSingleton<IQrScannerService>(sp => sp.GetRequiredService<QrScannerService>());
        builder.Services.AddSingleton<QrScanLimitService>();

        builder.Services.AddSingleton<PoiEntryCoordinator>();
        builder.Services.AddSingleton<IPoiEntryCoordinator>(sp => sp.GetRequiredService<PoiEntryCoordinator>());

        builder.Services.AddSingleton<DeepLinkHandler>();
        builder.Services.AddSingleton<PendingDeepLinkStore>();
        builder.Services.AddSingleton<DeepLinkCoordinator>();

        builder.Services.AddSingleton<LocationService>();
        builder.Services.AddSingleton<ILocationProvider>(sp => sp.GetRequiredService<LocationService>());

        builder.Services.AddSingleton<AudioService>();
        builder.Services.AddSingleton<IAudioPlayerService>(sp => sp.GetRequiredService<AudioService>());
        builder.Services.AddSingleton<AudioQueueService>();
        builder.Services.AddSingleton<IAudioQueueService>(sp => sp.GetRequiredService<AudioQueueService>());
        builder.Services.AddSingleton<MauiApp1.Infrastructure.AudioQueueConnectionManager>();

        // ── ROEL 7.2.6: runtime observability + passive efficiency signals (decorators; kernels unchanged)
        builder.Services.AddSingleton<RuntimeTelemetryService>();
        builder.Services.AddSingleton<IRuntimeTelemetry>(sp => sp.GetRequiredService<RuntimeTelemetryService>());
        builder.Services.AddSingleton<BatteryEfficiencyMonitor>();

        builder.Services.AddSingleton<IGeofenceService, GeofenceService>();

        builder.Services.AddSingleton<GeofenceArbitrationKernel>();
        builder.Services.AddSingleton<ObservingGeofenceArbitrationKernel>(sp => new ObservingGeofenceArbitrationKernel(
            sp.GetRequiredService<GeofenceArbitrationKernel>(),
            sp.GetRequiredService<IRuntimeTelemetry>(),
            sp.GetRequiredService<BatteryEfficiencyMonitor>()));

#if DEBUG
        builder.Services.AddSingleton<IGeofenceArbitrationKernel>(sp => new ChaosGeofenceArbitrationKernel(
            sp.GetRequiredService<ObservingGeofenceArbitrationKernel>(),
            sp.GetRequiredService<IRuntimeTelemetry>()));
#else
        builder.Services.AddSingleton<IGeofenceArbitrationKernel>(sp => sp.GetRequiredService<ObservingGeofenceArbitrationKernel>());
#endif

        builder.Services.AddSingleton<DevicePresenceService>();
        builder.Services.AddSingleton<BackgroundTaskService>();
        builder.Services.AddSingleton<AppState>();
        builder.Services.AddSingleton<RuntimeDeterminismGuard>();
        builder.Services.AddSingleton<MapUiStateArbitrator>();
        builder.Services.AddSingleton<ObservingMapUiStateArbitrator>(sp => new ObservingMapUiStateArbitrator(
            sp.GetRequiredService<MapUiStateArbitrator>(),
            sp.GetRequiredService<IRuntimeTelemetry>(),
            sp.GetRequiredService<AppState>()));

#if DEBUG
        builder.Services.AddSingleton<IMapUiStateArbitrator>(sp => new ChaosMapUiStateArbitrator(
            sp.GetRequiredService<ObservingMapUiStateArbitrator>()));
#else
        builder.Services.AddSingleton<IMapUiStateArbitrator>(sp => sp.GetRequiredService<ObservingMapUiStateArbitrator>());
#endif

        builder.Services.AddSingleton<NavigationService>();
        builder.Services.AddSingleton<ObservingNavigationService>(sp => new ObservingNavigationService(
            sp.GetRequiredService<NavigationService>(),
            sp.GetRequiredService<IRuntimeTelemetry>()));

#if DEBUG
        builder.Services.AddSingleton<INavigationService>(sp => new ChaosNavigationService(
            sp.GetRequiredService<ObservingNavigationService>()));
#else
        builder.Services.AddSingleton<INavigationService>(sp => sp.GetRequiredService<ObservingNavigationService>());
#endif

        builder.Services.AddSingleton<ChaosSimulationService>();
        builder.Services.AddSingleton<ProductionReadinessEvaluator>();
#if DEBUG
        builder.Services.AddSingleton<ChaosValidationEngine>();
        builder.Services.AddSingleton<RuntimeReplayEngine>();
#endif

        static Uri NormalizeApiBase(string raw)
        {
            var t = raw.Trim();
            if (!t.EndsWith('/'))
                t += "/";
            return new Uri(t, UriKind.Absolute);
        }

        var apiBase = NormalizeApiBase(BackendApiConfiguration.BaseUrl);

        builder.Services.AddSingleton<AuthTokenStore>();
        builder.Services.AddSingleton(sp =>
        {
            var loginClient = new HttpClient
            {
                BaseAddress = apiBase,
                Timeout = TimeSpan.FromSeconds(45)
            };
            return new AuthService(loginClient, sp.GetRequiredService<AuthTokenStore>());
        });
        builder.Services.AddSingleton<IDeviceIdProvider, DeviceIdProvider>();
        builder.Services.AddSingleton<IUserContextSnapshotProvider, UserContextSnapshotProvider>();
        builder.Services.AddSingleton<IEventBatchSink, LoggingTranslationEventBatchSink>();
        builder.Services.AddSingleton<TranslationTrackingSession>();
        builder.Services.AddSingleton(sp => new ContractObservability.ContractTelemetryTracker(
            sp.GetService<ILogger<ContractObservability.ContractTelemetryTracker>>()));
        builder.Services.AddSingleton<ContractObservability.IContractTelemetryTracker>(sp =>
            sp.GetRequiredService<ContractObservability.ContractTelemetryTracker>());
#if DEBUG
        builder.Services.AddSingleton<ContractEventJournal>();
        builder.Services.AddSingleton<IContractReplayCapture>(sp => sp.GetRequiredService<ContractEventJournal>());
        builder.Services.AddSingleton<ContractReplayDebugService>();
#else
        builder.Services.AddSingleton<IContractReplayCapture, NoOpContractReplayCapture>();
#endif
        builder.Services.AddSingleton<QueuedEventTracker>(sp => new QueuedEventTracker(
            sp.GetRequiredService<IEventBatchSink>(),
            sp.GetRequiredService<ILogger<QueuedEventTracker>>(),
            sp.GetService<ContractObservability.IContractTelemetryTracker>(),
            sp.GetRequiredService<IContractReplayCapture>()));
        builder.Services.AddSingleton<IEventTracker>(sp => sp.GetRequiredService<QueuedEventTracker>());

        // ── 7.3.1 RBEL client bridge (read-only ROEL tap → batch → 7.3.0 ingestion; no kernel changes)
        builder.Services.AddSingleton<RbelCorrelationScope>();
        builder.Services.AddSingleton<RbelRuntimeSequenceSource>();
        builder.Services.AddSingleton<IRbelEventQueue, RbelEventQueue>();
        builder.Services.AddSingleton(sp =>
        {
            var client = new HttpClient
            {
                BaseAddress = apiBase,
                Timeout = TimeSpan.FromSeconds(35)
            };
            return new RbelHttpClient(client, sp.GetRequiredService<AuthTokenStore>());
        });
        builder.Services.AddSingleton<RbelBackgroundDispatcher>();

        builder.Services.AddSingleton(sp =>
        {
            var handler = new AuthDelegatingHandler(
                    sp.GetRequiredService<AuthTokenStore>(),
                    sp)
            {
                InnerHandler = new HttpClientHandler()
            };
            var client = new HttpClient(handler)
            {
                BaseAddress = apiBase,
                Timeout = TimeSpan.FromSeconds(45)
            };
            var apiService = new ApiService(client);

            // Inject protected HttpClient vào AuthService để gọi /auth/me
            var authService = sp.GetRequiredService<AuthService>();
            authService.SetProtectedHttpClient(client);

            return apiService;
        });

        builder.Services.AddSingleton<SessionAuthRepository>();
        builder.Services.AddSingleton<IAuthRepository>(sp => sp.GetRequiredService<SessionAuthRepository>());
        builder.Services.AddSingleton<IPremiumService, PremiumService>();
        builder.Services.AddSingleton<NoOpSubscriptionRepository>();
        builder.Services.AddSingleton<ISubscriptionRepository>(sp => sp.GetRequiredService<NoOpSubscriptionRepository>());

        builder.Services.AddSingleton<LanguagePackService>();
        builder.Services.AddSingleton<ILanguagePackService>(sp => sp.GetRequiredService<LanguagePackService>());

        builder.Services.AddSingleton<ViewModels.MapViewModel>();
        builder.Services.AddSingleton<AppShell>();

        builder.Services.AddSingleton<PoiHydrationService>();
        builder.Services.AddSingleton<PoiNarrationService>();
        builder.Services.AddSingleton<PoiFocusService>();
        builder.Services.AddSingleton<LanguageSwitchService>();
        builder.Services.AddSingleton<AudioPrefetchService>();

        builder.Services.AddTransient<ViewModels.ExploreViewModel>();
        builder.Services.AddTransient<ExplorePage>();
        builder.Services.AddTransient<AboutPage>();
        builder.Services.AddTransient<MapPage>();
        builder.Services.AddTransient<LanguageSelectorPage>();
        builder.Services.AddTransient<ViewModels.LanguageSelectorViewModel>();

        builder.Services.AddTransient<Views.AddLanguagePage>();
        builder.Services.AddTransient<ViewModels.AddLanguageViewModel>();

        builder.Services.AddTransient<QrScannerPage>();
        builder.Services.AddTransient<ViewModels.QrScannerViewModel>();
        builder.Services.AddTransient<PoiDetailPage>();
        builder.Services.AddTransient<ViewModels.PoiDetailViewModel>();
        builder.Services.AddTransient<ZonePoisPage>();

        builder.Services.AddTransient<ViewModels.LoginViewModel>();
        builder.Services.AddTransient<LoginPage>();
        builder.Services.AddTransient<ViewModels.RegisterViewModel>();
        builder.Services.AddTransient<RegisterPage>();
        builder.Services.AddTransient<AuthStartupPage>();
        builder.Services.AddSingleton<ViewModels.ProfileViewModel>();
        builder.Services.AddTransient<ProfilePage>();
        builder.Services.AddTransient<AdminToolsPage>();

        builder.Services.AddTransient<MauiApp1.Application.UseCases.GetNearbyPoisUseCase>();
        builder.Services.AddTransient<MauiApp1.Application.UseCases.GetPoiDetailUseCase>();
        builder.Services.AddTransient<MauiApp1.Application.UseCases.PlayPoiAudioUseCase>();
        builder.Services.AddTransient<MauiApp1.Application.UseCases.GetAvailableLanguagesUseCase>();

        return builder.Build();
    }
}
