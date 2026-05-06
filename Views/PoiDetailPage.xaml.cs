using System.Diagnostics;
using MauiApp1.ViewModels;

namespace MauiApp1.Views;

public partial class PoiDetailPage : ContentPage
{
    private readonly PoiDetailViewModel _vm;
    private CancellationTokenSource? _uiTickerCts;

    public PoiDetailPage(PoiDetailViewModel vm)
    {
        InitializeComponent();
        BindingContext = _vm = vm;
        Debug.WriteLine($"[QR-LIFE] PoiDetailPage ctor hash={GetHashCode()}");
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        _vm.AttachListeners();
        StartUiTicker();
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
        _uiTickerCts?.Cancel();
        _vm.DetachListeners();
        base.OnDisappearing();
        Debug.WriteLine("[QR-LIFE] PoiDetailPage OnDisappearing");
    }

    private void StartUiTicker()
    {
        _uiTickerCts?.Cancel();
        _uiTickerCts = new CancellationTokenSource();
        var cts = _uiTickerCts;

        _ = Task.Run(async () =>
        {
            try
            {
                var accessTick = 0;
                while (!cts.IsCancellationRequested)
                {
                    await Task.Delay(500, cts.Token);
                    await MainThread.InvokeOnMainThreadAsync(_vm.RefreshAudioUiState);

                    accessTick++;
                    if (accessTick >= 20) // Every 10 seconds (20 * 500ms)
                    {
                        accessTick = 0;
                        await _vm.ReEvaluateAccessAsync(ct: cts.Token);
                    }
                }
            }
            catch (OperationCanceledException) { }
        }, cts.Token);
    }

    private async void OnPlayClicked(object sender, EventArgs e)
    {
        await _vm.PlayShortNarrationAsync();
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
