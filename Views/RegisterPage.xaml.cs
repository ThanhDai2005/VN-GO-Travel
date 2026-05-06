using MauiApp1.ViewModels;
using MauiApp1.Services;

namespace MauiApp1.Views;

public partial class RegisterPage : ContentPage
{
    private readonly INavigationService _navService;

    public RegisterPage(RegisterViewModel vm, INavigationService navService)
    {
        InitializeComponent();
        BindingContext = vm;
        _navService = navService;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        
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

    private async void OnBackClicked(object sender, EventArgs e)
    {
        try
        {
            // Thử pop navigation stack trước
            if (Navigation != null && Navigation.NavigationStack.Count > 1)
            {
                await Navigation.PopAsync();
            }
            else
            {
                // Fallback: sử dụng navigation service
                await _navService.GoBackAsync();
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[REGISTER] OnBackClicked error: {ex.Message}");
            // Thử phương án khác
            try
            {
                await _navService.GoBackAsync();
            }
            catch (Exception ex2)
            {
                System.Diagnostics.Debug.WriteLine($"[REGISTER] Navigation fallback error: {ex2.Message}");
            }
        }
    }
}

