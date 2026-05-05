using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows.Input;
using MauiApp1.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Maui.Controls;

namespace MauiApp1.ViewModels;

public sealed class RegisterViewModel : INotifyPropertyChanged
{
    private readonly AuthService _auth;
    private readonly INavigationService _nav;
    private readonly IServiceProvider _services;

    private string _fullName = "";
    private string _email = "";
    private string _password = "";
    private string _confirmPassword = "";
    private bool _isBusy;
    private string? _errorMessage;

    public RegisterViewModel(AuthService auth, INavigationService nav, IServiceProvider services)
    {
        _auth = auth;
        _nav = nav;
        _services = services;
        RegisterCommand = new Command(ExecuteRegister, () => !IsBusy);
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public string FullName
    {
        get => _fullName;
        set
        {
            if (_fullName == value) return;
            _fullName = value;
            OnPropertyChanged();
        }
    }

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

    public string ConfirmPassword
    {
        get => _confirmPassword;
        set
        {
            if (_confirmPassword == value) return;
            _confirmPassword = value;
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
            (RegisterCommand as Command)?.ChangeCanExecute();
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

    public ICommand RegisterCommand { get; }

    private void ExecuteRegister()
    {
        if (IsBusy) return;
        _ = RegisterCoreAsync();
    }

    private async Task RegisterCoreAsync()
    {
        if (string.IsNullOrWhiteSpace(Email) || string.IsNullOrWhiteSpace(Password))
        {
            ErrorMessage = "Nhap email va mat khau.";
            return;
        }

        if (Password.Length < 6)
        {
            ErrorMessage = "Mat khau toi thieu 6 ky tu.";
            return;
        }

        if (!string.Equals(Password, ConfirmPassword, StringComparison.Ordinal))
        {
            ErrorMessage = "Nhap lai mat khau khong khop.";
            return;
        }

        IsBusy = true;
        ErrorMessage = null;
        try
        {
            var (ok, err) = await _auth.RegisterAsync(Email, Password, FullName).ConfigureAwait(false);

            await MainThread.InvokeOnMainThreadAsync(() =>
            {
                if (!ok)
                {
                    ErrorMessage = err;
                    return;
                }

                Password = "";
                ConfirmPassword = "";
                OnPropertyChanged(nameof(Password));
                OnPropertyChanged(nameof(ConfirmPassword));
            }).ConfigureAwait(false);

            if (ok)
            {
                await MainThread.InvokeOnMainThreadAsync(async () =>
                {
                    // Sau khi đăng ký thành công, chuyển đến AppShell và mở tab profile
                    if (global::Microsoft.Maui.Controls.Application.Current?.MainPage is NavigationPage)
                    {
                        if (global::Microsoft.Maui.Controls.Application.Current?.Windows.Count > 0)
                            global::Microsoft.Maui.Controls.Application.Current.Windows[0].Page = _services.GetRequiredService<MauiApp1.AppShell>();
                        else
                            global::Microsoft.Maui.Controls.Application.Current!.MainPage = _services.GetRequiredService<MauiApp1.AppShell>();
                        // Đợi một chút để Shell được khởi tạo hoàn toàn
                        await Task.Delay(100);
                        await Shell.Current.GoToAsync("//profile");
                    }
                    else if (global::Microsoft.Maui.Controls.Application.Current?.MainPage is Shell)
                    {
                        await _nav.PopModalAsync();
                        // Đợi một chút để navigation hoàn tất
                        await Task.Delay(100);
                        await Shell.Current.GoToAsync("//profile");
                    }
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

