using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows.Input;
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
        _auth.SessionChanged += (_, _) => MainThread.BeginInvokeOnMainThread(RefreshFromAuth);
        _auth.PropertyChanged += (_, e) =>
        {
            if (e.PropertyName is nameof(AuthService.IsAuthenticated) or nameof(AuthService.Email)
                or nameof(AuthService.Role) or nameof(AuthService.IsPremium) or nameof(AuthService.IsOwner)
                or nameof(AuthService.IsAdmin))
                MainThread.BeginInvokeOnMainThread(RefreshFromAuth);
        };

        RefreshFromAuth();
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public string DisplayEmail => string.IsNullOrEmpty(_auth.Email) ? "Chua dang nhap" : _auth.Email;

    public string RoleDisplay => _auth.IsAuthenticated ? _auth.Role : "-";

    public string PremiumDisplay => _auth.IsAuthenticated ? (_auth.IsPremium ? "Premium" : "Thuong") : "-";

    public bool IsLoggedIn => _auth.IsAuthenticated;

    public bool IsNotLoggedIn => !_auth.IsAuthenticated;

    public bool ShowOwnerSection => _auth.IsAuthenticated && _auth.IsOwner;

    public bool ShowAdminSection => _auth.IsAuthenticated && _auth.IsAdmin;

    public ICommand LoginCommand { get; }

    public ICommand LogoutCommand { get; }

    public void RefreshFromAuth()
    {
        OnPropertyChanged(nameof(DisplayEmail));
        OnPropertyChanged(nameof(RoleDisplay));
        OnPropertyChanged(nameof(PremiumDisplay));
        OnPropertyChanged(nameof(IsLoggedIn));
        OnPropertyChanged(nameof(IsNotLoggedIn));
        OnPropertyChanged(nameof(ShowOwnerSection));
        OnPropertyChanged(nameof(ShowAdminSection));
        (LogoutCommand as Command)?.ChangeCanExecute();
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

    private void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
