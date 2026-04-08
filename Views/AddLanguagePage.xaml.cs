using MauiApp1.ViewModels;

namespace MauiApp1.Views;

public partial class AddLanguagePage : ContentPage
{
    private readonly AddLanguageViewModel _vm;

    public AddLanguagePage(AddLanguageViewModel vm)
    {
        InitializeComponent();
        BindingContext = _vm = vm;

        _vm.RequestClose += async (_, _) =>
            await MainThread.InvokeOnMainThreadAsync(async () =>
                await Navigation.PopModalAsync(animated: true));
    }

    private async void OnCloseClicked(object sender, EventArgs e)
        => await Navigation.PopModalAsync(animated: true);
}
