using System.ComponentModel;
using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Windows.Input;
using MauiApp1.Models.Auth;
using MauiApp1.Services;
using MauiApp1.Views;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Maui.Controls;
using Microsoft.Maui.Graphics;

namespace MauiApp1.ViewModels;

public sealed class ProfileViewModel : INotifyPropertyChanged
{
    private readonly AuthService _auth;
    private readonly INavigationService _nav;
    private readonly IServiceProvider _services;
    public ProfileViewModel(AuthService auth, INavigationService nav, IServiceProvider services)
    {
        _auth = auth;
        _nav = nav;
        _services = services;

        LoginCommand = new Command(() => _ = OpenLoginAsync());
        LogoutCommand = new Command(() => _ = LogoutCoreAsync(), () => _auth.IsAuthenticated);
        OpenPurchaseHistoryCommand = new Command(async () => await OpenPurchaseHistoryAsync(), () => _auth.IsAuthenticated);
        OpenDownloadManagerCommand = new Command(async () => await OpenDownloadManagerAsync(), () => _auth.IsAuthenticated);
        RefreshWalletCommand = new Command(async () => await RefreshWalletAsync(), () => _auth.IsAuthenticated);


        _auth.SessionChanged += (_, _) => MainThread.BeginInvokeOnMainThread(RefreshFromAuth);
        _auth.PropertyChanged += (_, e) =>
        {
            if (e.PropertyName is nameof(AuthService.IsAuthenticated) or nameof(AuthService.Email)
                or nameof(AuthService.Role) or nameof(AuthService.IsOwner)
                or nameof(AuthService.IsAdmin))
                MainThread.BeginInvokeOnMainThread(RefreshFromAuth);
        };

        RefreshFromAuth();
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public string DisplayEmail => string.IsNullOrEmpty(_auth.Email) ? "Chua dang nhap" : _auth.Email;

    public string RoleDisplay => _auth.IsAuthenticated ? _auth.Role : "-";

    public string DisplayBalance => _auth.IsAuthenticated ? $"{_auth.WalletBalance:N0} xu" : "0 xu";

    public bool IsLoggedIn => _auth.IsAuthenticated;

    public bool IsNotLoggedIn => !_auth.IsAuthenticated;

    public bool ShowOwnerSection => _auth.IsAuthenticated && _auth.IsOwner;

    public bool ShowAdminSection => _auth.IsAuthenticated && _auth.IsAdmin;

    public ICommand LoginCommand { get; }

    public ICommand LogoutCommand { get; }
    public ICommand OpenPurchaseHistoryCommand { get; }
    public ICommand OpenDownloadManagerCommand { get; }
    public ICommand RefreshWalletCommand { get; }

    public void RefreshFromAuth()
    {
        OnPropertyChanged(nameof(DisplayEmail));
        OnPropertyChanged(nameof(RoleDisplay));
        OnPropertyChanged(nameof(IsLoggedIn));
        OnPropertyChanged(nameof(IsNotLoggedIn));
        OnPropertyChanged(nameof(ShowOwnerSection));
        OnPropertyChanged(nameof(ShowAdminSection));
        OnPropertyChanged(nameof(DisplayBalance));
        (LogoutCommand as Command)?.ChangeCanExecute();
        (OpenPurchaseHistoryCommand as Command)?.ChangeCanExecute();
        (OpenDownloadManagerCommand as Command)?.ChangeCanExecute();
    }

    private async Task OpenLoginAsync()
    {
        var page = _services.GetRequiredService<LoginPage>();
        await _nav.PushModalAsync(page).ConfigureAwait(false);
    }

    private async Task LogoutCoreAsync()
    {
        await _auth.LogoutAsync().ConfigureAwait(false);
        await MainThread.InvokeOnMainThreadAsync(async () =>
        {
            RefreshFromAuth();
            if (Shell.Current != null)
                await _nav.NavigateToAsync("//profile");
        });
    }

    private Task OpenPurchaseHistoryAsync()
        => _nav.NavigateToAsync("purchasehistory");

    private Task OpenDownloadManagerAsync()
        => _nav.NavigateToAsync("downloadmanager");

    private async Task RefreshWalletAsync()
    {
        // Simple strategy: just re-fetch profile which includes balance
        // We could also have a dedicated wallet endpoint
        try
        {
            var api = _services.GetRequiredService<ApiService>();
            using var resp = await api.GetAsync("auth/me").ConfigureAwait(false);
            if (resp.IsSuccessStatusCode)
            {
                var envelope = await resp.Content.ReadFromJsonAsync<MeApiEnvelope>().ConfigureAwait(false);
                if (envelope?.Data != null)
                {
                    // Update balance through AuthService if possible, or just refresh here
                    // Since we want it to persist, better update AuthService
                    // For now, let's just trigger a session restore or similar
                    await _auth.RestoreSessionAsync().ConfigureAwait(false);
                }
            }
        }
        catch { /* ignore */ }
    }

    private void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
