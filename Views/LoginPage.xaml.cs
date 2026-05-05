using MauiApp1.Services;
using MauiApp1.ViewModels;
using Microsoft.Extensions.DependencyInjection;

namespace MauiApp1.Views;

public partial class LoginPage : ContentPage
{
    private readonly INavigationService _nav;
    private readonly IServiceProvider _services;

    public LoginPage(LoginViewModel viewModel, INavigationService nav, IServiceProvider services)
    {
        InitializeComponent();
        BindingContext = viewModel;
        _nav = nav;
        _services = services;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        
        // Entry animations
        var content = this.Content;
        if (content != null)
        {
            content.Opacity = 0;
            content.TranslationY = 30;
            
            await Task.WhenAll(
                content.FadeToAsync(1, 400, Easing.CubicOut),
                content.TranslateToAsync(0, 0, 400, Easing.CubicOut)
            );
        }
    }

    private async void OnOpenRegisterClicked(object sender, EventArgs e)
    {
        try
        {
            var page = _services.GetRequiredService<RegisterPage>();

            // Kiểm tra xem có navigation stack không
            if (Navigation != null && Navigation.NavigationStack.Count > 0)
            {
                await Navigation.PushAsync(page);
            }
            else
            {
                // Fallback: sử dụng navigation service
                await _nav.NavigateToAsync("register");
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[LOGIN] OnOpenRegisterClicked error: {ex.Message}");
            // Thử phương án khác
            try
            {
                await _nav.NavigateToAsync("register");
            }
            catch (Exception ex2)
            {
                System.Diagnostics.Debug.WriteLine($"[LOGIN] Navigation fallback error: {ex2.Message}");
            }
        }
    }

    private void OnCloseClicked(object sender, EventArgs e)
    {
        if (global::Microsoft.Maui.Controls.Application.Current?.MainPage is NavigationPage nav)
        {
            if (nav.Navigation.NavigationStack.Count > 1)
            {
                _ = nav.PopAsync();
                return;
            }

            if (nav.CurrentPage is LoginPage)
            {
                global::Microsoft.Maui.Controls.Application.Current?.Quit();
                return;
            }
        }

        _ = _nav.PopModalAsync();
    }
}
