using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows.Input;
using MauiApp1.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Maui.Controls;

namespace MauiApp1.ViewModels;

public sealed class LoginViewModel : INotifyPropertyChanged
{
    private readonly AuthService _auth;
    private readonly INavigationService _nav;
    private readonly IServiceProvider _services;

    private string _email = "";
    private string _password = "";
    private bool _isBusy;
    private string? _errorMessage;

    public LoginViewModel(AuthService auth, INavigationService nav, IServiceProvider services)
    {
        _auth = auth;
        _nav = nav;
        _services = services;
        LoginCommand = new Command(ExecuteLogin, () => !IsBusy);
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public string Email
    {
        get => _email;
        set
        {
            if (_email == value) return;
            _email = value;
            OnPropertyChanged();
        }
    }

    public string Password
    {
        get => _password;
        set
        {
            if (_password == value) return;
            _password = value;
            OnPropertyChanged();
        }
    }

    public bool IsBusy
    {
        get => _isBusy;
        set
        {
            if (_isBusy == value) return;
            _isBusy = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(IsNotBusy));
            (LoginCommand as Command)?.ChangeCanExecute();
        }
    }

    public bool IsNotBusy => !IsBusy;

    public string? ErrorMessage
    {
        get => _errorMessage;
        set
        {
            if (_errorMessage == value) return;
            _errorMessage = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(HasError));
        }
    }

    public bool HasError => !string.IsNullOrEmpty(ErrorMessage);

    public ICommand LoginCommand { get; }

    private void ExecuteLogin()
    {
        if (IsBusy) return;
        _ = LoginCoreAsync();
    }


    private async Task LoginCoreAsync()
    {
        IsBusy = true;
        ErrorMessage = null;

        try
        {
            var (ok, err) = await _auth.LoginAsync(Email, Password).ConfigureAwait(false);

            await MainThread.InvokeOnMainThreadAsync(() =>
            {
                if (!ok)
                {
                    ErrorMessage = err;
                    return;
                }

                Password = "";
                OnPropertyChanged(nameof(Password));
            }).ConfigureAwait(false);

            if (ok)
            {
                await MainThread.InvokeOnMainThreadAsync(() =>
                {
                    if (global::Microsoft.Maui.Controls.Application.Current?.MainPage is Shell)
                        _ = _nav.PopModalAsync();
                    else if (global::Microsoft.Maui.Controls.Application.Current?.MainPage is NavigationPage)
                        if (global::Microsoft.Maui.Controls.Application.Current?.Windows.Count > 0)
                            global::Microsoft.Maui.Controls.Application.Current.Windows[0].Page = _services.GetRequiredService<MauiApp1.AppShell>();
                        else
                            global::Microsoft.Maui.Controls.Application.Current!.MainPage = _services.GetRequiredService<MauiApp1.AppShell>();
                }).ConfigureAwait(false);
            }
        }
        finally
        {
            await MainThread.InvokeOnMainThreadAsync(() => IsBusy = false).ConfigureAwait(false);
        }
    }

    private void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
