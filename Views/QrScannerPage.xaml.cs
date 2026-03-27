using MauiApp1.ViewModels;

namespace MauiApp1.Views;

public partial class QrScannerPage : ContentPage
{
    public QrScannerPage(QrScannerViewModel vm)
    {
        InitializeComponent();
        BindingContext = vm;
    }
}
