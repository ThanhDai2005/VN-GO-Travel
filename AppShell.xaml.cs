using MauiApp1.Views;

namespace MauiApp1;

public partial class AppShell : Shell
{
    public AppShell(IServiceProvider services)
    {
        InitializeComponent();

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

        // Register QR routes (Phase-1A)
        Routing.RegisterRoute("qrscan", typeof(QrScannerPage));
        Routing.RegisterRoute("poidetail", typeof(PoiDetailPage));
    }
}