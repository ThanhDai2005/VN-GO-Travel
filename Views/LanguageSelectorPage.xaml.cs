using MauiApp1.ViewModels;

namespace MauiApp1.Views;

/// <summary>
/// Modal page for language selection with download awareness.
/// Opened from MapPage toolbar button via Navigation.PushModalAsync.
/// </summary>
public partial class LanguageSelectorPage : ContentPage
{
    private readonly LanguageSelectorViewModel _vm;

    public LanguageSelectorPage(LanguageSelectorViewModel vm)
    {
        InitializeComponent();
        BindingContext = _vm = vm;

        // When the VM decides the flow is complete, close the modal.
        _vm.RequestClose += async (_, _) =>
            await MainThread.InvokeOnMainThreadAsync(async () =>
                await Navigation.PopModalAsync(animated: true));
    }

    private async void OnCloseClicked(object sender, EventArgs e)
        => await Navigation.PopModalAsync(animated: true);

    private async void OnAddLanguageClicked(object sender, EventArgs e)
    {
        var vm = Application.Current?.Windows.FirstOrDefault()?.Page?.Handler?.MauiContext?.Services.GetService<AddLanguageViewModel>();
        if (vm != null)
        {
            await Navigation.PushModalAsync(new AddLanguagePage(vm), animated: true);
        }
    }
}
