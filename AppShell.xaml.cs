using MauiApp1.Views;
using MauiApp1.Services;
using Microsoft.Extensions.DependencyInjection;

namespace MauiApp1;

public partial class AppShell : Shell
{
    private readonly IServiceProvider _services;
    private readonly DeepLinkCoordinator? _deepLinkCoordinator;
    private readonly AuthService _auth;
    private ShellContent? _adminTab;

    public AppShell(IServiceProvider services)
    {
        InitializeComponent();
        _services = services;

        _deepLinkCoordinator = services.GetService<DeepLinkCoordinator>();
        _auth = services.GetRequiredService<AuthService>();

        var tabBar = new TabBar();

        tabBar.Items.Add(new ShellContent
        {
            Title = "Kham pha",
            Route = "explore",
            ContentTemplate = new DataTemplate(() => services.GetRequiredService<ExplorePage>())
        });

        tabBar.Items.Add(new ShellContent
        {
            Title = "Ban do",
            Route = "map",
            ContentTemplate = new DataTemplate(() => services.GetRequiredService<MapPage>())
        });

        tabBar.Items.Add(new ShellContent
        {
            Title = "QR",
            Route = "qrscan",
            ContentTemplate = new DataTemplate(() => services.GetRequiredService<QrScannerPage>())
        });

        tabBar.Items.Add(new ShellContent
        {
            Title = "Tai khoan",
            Route = "profile",
            ContentTemplate = new DataTemplate(() => services.GetRequiredService<ProfilePage>())
        });

        _adminTab = new ShellContent
        {
            Title = "Quan tri",
            Route = "admintools",
            ContentTemplate = new DataTemplate(() => services.GetRequiredService<AdminToolsPage>())
        };
        _adminTab.IsVisible = false;
        tabBar.Items.Add(_adminTab);

        tabBar.Items.Add(new ShellContent
        {
            Title = "Gioi thieu",
            Route = "about",
            ContentTemplate = new DataTemplate(() => services.GetRequiredService<AboutPage>())
        });

        Items.Add(tabBar);

        Routing.RegisterRoute("poidetail", typeof(PoiDetailPage));

        _auth.SessionChanged += (_, _) => MainThread.BeginInvokeOnMainThread(UpdateRoleTabs);
        _auth.PropertyChanged += (_, e) =>
        {
            if (e.PropertyName is nameof(AuthService.IsOwner) or nameof(AuthService.IsAdmin) or nameof(AuthService.IsAuthenticated))
                MainThread.BeginInvokeOnMainThread(UpdateRoleTabs);
        };
        UpdateRoleTabs();
    }

    private void UpdateRoleTabs()
    {
        if (_adminTab != null)
            _adminTab.IsVisible = _auth.IsAuthenticated && _auth.IsAdmin;
    }

    protected override void OnAppearing()
    {
        base.OnAppearing();
        System.Diagnostics.Debug.WriteLine("[DL-DISPATCH] AppShell OnAppearing");
        _ = AppBootstrapPipeline.OnShellReadyAsync(_services, _deepLinkCoordinator);
    }
}