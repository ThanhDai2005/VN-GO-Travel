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

    protected override void OnAppearing()
    {
        base.OnAppearing();
        _vm.AttachPreferredLanguageListener();
        Debug.WriteLine($"[QR-LIFE] PoiDetailPage OnAppearing Poi null?={_vm.Poi == null}");
    }

    protected override void OnDisappearing()
    {
        _vm.DetachPreferredLanguageListener();
        base.OnDisappearing();
        Debug.WriteLine("[QR-LIFE] PoiDetailPage OnDisappearing");
    }

    private async void OnPlayClicked(object sender, EventArgs e)
    {
        await _vm.PlayAsync();
    }

    private async void OnOpenOnMapClicked(object sender, EventArgs e)
    {
        await _vm.OpenOnMapAsync();
    }

    private void OnStopClicked(object sender, EventArgs e)
    {
        _vm.Stop();
    }
}
