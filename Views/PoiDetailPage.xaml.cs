using System.Diagnostics;
using MauiApp1.ViewModels;

namespace MauiApp1.Views;

public partial class PoiDetailPage : ContentPage
{
    private readonly PoiDetailViewModel _vm;

    public PoiDetailPage(PoiDetailViewModel vm)
    {
        InitializeComponent();
        BindingContext = _vm = vm;
        Debug.WriteLine($"[QR-LIFE] PoiDetailPage ctor hash={GetHashCode()}");
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        _vm.AttachPreferredLanguageListener();
        Debug.WriteLine($"[QR-LIFE] PoiDetailPage OnAppearing Poi null?={_vm.Poi == null}");

        var content = this.Content;
        if (content != null)
        {
            content.Opacity = 0;
            content.TranslationY = 20;
            
            await Task.WhenAll(
                content.FadeToAsync(1, 450, Easing.CubicOut),
                content.TranslateToAsync(0, 0, 450, Easing.CubicOut)
            );
        }
    }

    protected override void OnDisappearing()
    {
        _vm.DetachPreferredLanguageListener();
        base.OnDisappearing();
        Debug.WriteLine("[QR-LIFE] PoiDetailPage OnDisappearing");
    }

    private async void OnPlayClicked(object sender, EventArgs e)
    {
        await _vm.PlayDetailedAsync();
    }

    private async void OnOpenOnMapClicked(object sender, EventArgs e)
    {
        await _vm.OpenOnMapAsync();
    }

    private async void OnPlayDetailedClicked(object sender, EventArgs e)
    {
        await _vm.PlayDetailedAsync();
    }

    private void OnStopClicked(object sender, EventArgs e)
    {
        _vm.Stop();
    }
}
