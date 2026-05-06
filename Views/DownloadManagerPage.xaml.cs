using MauiApp1.ViewModels;

namespace MauiApp1.Views;

public partial class DownloadManagerPage : ContentPage
{
    private readonly DownloadManagerViewModel _vm;

    public DownloadManagerPage(DownloadManagerViewModel vm)
    {
        InitializeComponent();
        BindingContext = _vm = vm;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        await _vm.EnsureAuthAndLoadAsync();
    }
}
