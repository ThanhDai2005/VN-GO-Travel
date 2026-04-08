using MauiApp1.Services;

namespace MauiApp1;

public partial class App : Application
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
        MainPage = services.GetRequiredService<AppShell>();
        System.Diagnostics.Debug.WriteLine("[DeepLink] App constructor exit");
    }

    protected override void OnResume()
    {
        base.OnResume();
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