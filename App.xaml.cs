using MauiApp1.Services;
using MauiApp1.Services.Observability;
using MauiApp1.Services.RBEL;
using MauiApp1.Views;
using Microsoft.Extensions.DependencyInjection;

namespace MauiApp1;

public partial class App : Microsoft.Maui.Controls.Application
{
    private readonly IServiceProvider _services;

    public App(IServiceProvider services)
    {
        InitializeComponent();

        System.Diagnostics.Debug.WriteLine("[DeepLink] App constructor enter");

        // Global exception hooks for startup diagnostics
        AppDomain.CurrentDomain.UnhandledException += (s, e) =>
        {
            System.Diagnostics.Debug.WriteLine($"[DeepLink] UnhandledException: {e.ExceptionObject}");
        };

        TaskScheduler.UnobservedTaskException += (s, e) =>
        {
            System.Diagnostics.Debug.WriteLine($"[DeepLink] UnobservedTaskException: {e.Exception}");
        };

#if ANDROID
        try
        {
            Android.Runtime.AndroidEnvironment.UnhandledExceptionRaiser += (s, e) =>
            {
                System.Diagnostics.Debug.WriteLine($"[DeepLink] AndroidUnhandled: {e.Exception}");
            };
        }
        catch { }
#endif

        _services = services;
        MainPage = services.GetRequiredService<AuthStartupPage>();

        // RDGL (7.2.5): eager attach DEBUG thread-affinity checks for GAK/MSAL surface properties.
        _ = services.GetRequiredService<RuntimeDeterminismGuard>();

        // ROEL (7.2.6): start telemetry processor + ring buffer early (non-blocking decorators).
        _ = services.GetRequiredService<RuntimeTelemetryService>();

        // 7.3.1 RBEL client bridge: background poll of ROEL snapshot → batch → 7.3.0 ingestion (no kernel edits).
        _ = Task.Run(() =>
        {
            try
            {
                services.GetRequiredService<RbelBackgroundDispatcher>().Start();
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[RBEL] dispatcher start: {ex.Message}");
            }
        });

        _ = Task.Run(async () =>
        {
            try
            {
                await services.GetRequiredService<IDeviceIdProvider>().GetOrCreateDeviceIdAsync().ConfigureAwait(false);
            }
            catch { }
        });

        StartBackgroundServices();

        System.Diagnostics.Debug.WriteLine("[DeepLink] App constructor exit");
    }

    private void StartBackgroundServices()
    {
        try
        {
            _services.GetService<BackgroundTaskService>()?.StartServices();
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[BACK-ERR] StartBackgroundServices: {ex}");
        }
    }

    private void StopBackgroundServices()
    {
        try
        {
            _services.GetService<BackgroundTaskService>()?.StopServices();
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[BACK-ERR] StopBackgroundServices: {ex}");
        }
    }

    protected override void OnStart()
    {
        base.OnStart();
        StartBackgroundServices();
    }

    protected override void OnSleep()
    {
        try
        {
            _services.GetService<QueuedEventTracker>()?.FlushAsync().GetAwaiter().GetResult();
        }
        catch { }

        base.OnSleep();
        try
        {
            // Best effort: notify backend immediately so Admin device screen flips to Offline right away.
            _services.GetService<DevicePresenceService>()?
                .SendOfflineAsync()
                .Wait(1200);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[PRESENCE] Immediate offline on sleep failed: {ex}");
        }
        StopBackgroundServices();
    }

    protected override void OnResume()
    {
        base.OnResume();
        StartBackgroundServices();
        _ = Task.Run(async () =>
        {
            try
            {
                var presence = _services.GetService<DevicePresenceService>();
                if (presence != null)
                    await presence.SendHeartbeatAsync().ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[PRESENCE] Resume heartbeat: {ex}");
            }
        });
#if ANDROID
        try
        {
            _services.GetService<DeepLinkCoordinator>()?.OnAppResumed();
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[DL-ERR] OnResume DeepLinkCoordinator: {ex}");
        }
#endif
    }
}