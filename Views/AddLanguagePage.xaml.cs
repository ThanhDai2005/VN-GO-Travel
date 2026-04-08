using MauiApp1.ViewModels;
using MauiApp1.Services;

namespace MauiApp1.Views;

public partial class AddLanguagePage : ContentPage
{
    private readonly AddLanguageViewModel _vm;
    private readonly INavigationService _navService;

    public AddLanguagePage(AddLanguageViewModel vm, INavigationService navService)
    {
        InitializeComponent();
        BindingContext = _vm = vm;
        _navService = navService;

        _vm.RequestClose += async (_, _) =>
            await MainThread.InvokeOnMainThreadAsync(async () =>
                await _navService.PopModalAsync(animated: true));
    }

    private async void OnCloseClicked(object sender, EventArgs e)
        => await _navService.PopModalAsync(animated: true);
}
