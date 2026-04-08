using MauiApp1.Views;
using MauiApp1.Services;
using Microsoft.Extensions.DependencyInjection;

namespace MauiApp1;

public partial class AppShell : Shell
{
    private readonly DeepLinkCoordinator? _deepLinkCoordinator;

    public AppShell(IServiceProvider services)
    {
        InitializeComponent();

        _deepLinkCoordinator = services.GetService<DeepLinkCoordinator>();

        var tabBar = new TabBar();

        tabBar.Items.Add(new ShellContent
        {
            Title = "Khám phá",
            Route = "explore",
            ContentTemplate = new DataTemplate(() => services.GetRequiredService<ExplorePage>())
        });

        tabBar.Items.Add(new ShellContent
        {
            Title = "Bản đồ",
            Route = "map",
            ContentTemplate = new DataTemplate(() => services.GetRequiredService<MapPage>())
        });

        // QR tab
        tabBar.Items.Add(new ShellContent
        {
            Title = "QR",
            Route = "qrscan",
            ContentTemplate = new DataTemplate(() => services.GetRequiredService<QrScannerPage>())
        });

        tabBar.Items.Add(new ShellContent
        {
            Title = "Giới thiệu",
            Route = "about",
            ContentTemplate = new DataTemplate(() => services.GetRequiredService<AboutPage>())
        });

        Items.Add(tabBar);

        // Stack push for POI detail (tab "qrscan" is already declared on TabBar; do not RegisterRoute the same name).
        Routing.RegisterRoute("poidetail", typeof(PoiDetailPage));
    }

    protected override void OnAppearing()
    {
        base.OnAppearing();
        // Warm deep links are dispatched from MainActivity -> DeepLinkCoordinator. Re-check here
        // in case an intent arrived before Shell was first ready (no duplicate one-shot gate).
        System.Diagnostics.Debug.WriteLine("[DL-DISPATCH] AppShell OnAppearing");
        _deepLinkCoordinator?.OnShellAppeared();
    }
}