using System.Diagnostics;
using MauiApp1.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Maui.Controls;

namespace MauiApp1.Views;

public partial class AuthStartupPage : ContentPage
{
    private readonly IServiceProvider _services;
    private bool _started;

    public AuthStartupPage(IServiceProvider services)
    {
        InitializeComponent();
        _services = services;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        if (_started)
            return;
        _started = true;

        try
        {
            var auth = _services.GetRequiredService<AuthService>();
            await auth.RestoreSessionAsync().ConfigureAwait(false);

            await MainThread.InvokeOnMainThreadAsync(() =>
            {
                // New flow: always enter app shell first (guest mode allowed).
                global::Microsoft.Maui.Controls.Application.Current!.MainPage = _services.GetRequiredService<AppShell>();
            });
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[AUTH-START] {ex}");
            await MainThread.InvokeOnMainThreadAsync(() =>
            {
                global::Microsoft.Maui.Controls.Application.Current!.MainPage = _services.GetRequiredService<AppShell>();
            });
        }
    }
}
