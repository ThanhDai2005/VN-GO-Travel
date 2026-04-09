using MauiApp1.ViewModels;
using MauiApp1.Services;

namespace MauiApp1.Views;

/// <summary>
/// Modal page for language selection with download awareness.
/// Opened from MapPage toolbar button via Navigation.PushModalAsync.
/// </summary>
public partial class LanguageSelectorPage : ContentPage
{
    private readonly LanguageSelectorViewModel _vm;
    private readonly INavigationService _navService;

    public LanguageSelectorPage(LanguageSelectorViewModel vm, INavigationService navService)
    {
        InitializeComponent();
        BindingContext = _vm = vm;
        _navService = navService;

        // When the VM decides the flow is complete, close the modal via service.
        _vm.RequestClose += async (_, _) =>
            await MainThread.InvokeOnMainThreadAsync(async () =>
                await _navService.PopModalAsync(animated: true));
    }

    private async void OnCloseClicked(object sender, EventArgs e)
        => await _navService.PopModalAsync(animated: true);

    private async void OnAddLanguageClicked(object sender, EventArgs e)
    {
        var vm = Application.Current?.Windows.FirstOrDefault()?.Page?.Handler?.MauiContext?.Services.GetService<AddLanguageViewModel>();
        if (vm != null)
        {
            var page = new AddLanguagePage(vm, _navService);
            await _navService.PushModalAsync(page, animated: true);
        }
    }
}
