using MauiApp1.ViewModels;

namespace MauiApp1.Views;

public partial class PurchaseHistoryPage : ContentPage
{
    private readonly PurchaseHistoryViewModel _vm;

    public PurchaseHistoryPage(PurchaseHistoryViewModel vm)
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
