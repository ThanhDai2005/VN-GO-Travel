using MauiApp1.ViewModels;

namespace MauiApp1.Views;

public partial class PoiDetailPage : ContentPage
{
    private readonly PoiDetailViewModel _vm;

    public PoiDetailPage(PoiDetailViewModel vm)
    {
        InitializeComponent();
        BindingContext = _vm = vm;
    }

    private async void OnPlayClicked(object sender, EventArgs e)
    {
        await _vm.PlayAsync();
    }

    private void OnStopClicked(object sender, EventArgs e)
    {
        _vm.Stop();
    }
}
