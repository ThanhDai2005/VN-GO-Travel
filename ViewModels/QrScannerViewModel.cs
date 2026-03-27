using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Threading.Tasks;
using System.Windows.Input;
using MauiApp1.Services;
using Microsoft.Maui.Controls;

namespace MauiApp1.ViewModels;

public class QrScannerViewModel : INotifyPropertyChanged
{
    private readonly PoiDatabase _db;
    private readonly ViewModels.MapViewModel _mapVm;
    private bool _isHandlingScan;

    public QrScannerViewModel(PoiDatabase db, MapViewModel mapVm)
    {
        _db = db;
        _mapVm = mapVm;

        ScanCommand = new Command(async () => await ScanAsync());
        CancelCommand = new Command(async () => await CancelAsync());
    }

    private string _inputText = string.Empty;
    public string InputText
    {
        get => _inputText;
        set { _inputText = value; OnPropertyChanged(); }
    }

    private string _message = string.Empty;
    public string Message
    {
        get => _message;
        set { _message = value; OnPropertyChanged(); }
    }

    private bool _isBusy;
    public bool IsBusy
    {
        get => _isBusy;
        set { _isBusy = value; OnPropertyChanged(); }
    }

    public ICommand ScanCommand { get; }
    public ICommand CancelCommand { get; }

    public event PropertyChangedEventHandler? PropertyChanged;
    private void OnPropertyChanged([CallerMemberName] string name = "")
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));

    public async Task ScanAsync()
    {
        if (IsBusy) return;

        IsBusy = true;
        Message = string.Empty;

        try
        {
            var parsed = QrResolver.Parse(InputText);
            if (!parsed.Success)
            {
                Message = parsed.Error ?? "Invalid QR";
                return;
            }

            var code = parsed.Code!;

            await _db.InitAsync();

            var preferredLang = _mapVm.CurrentLanguage;

            var poi = await _db.GetByCodeAsync(code, preferredLang);

            if (poi == null)
            {
                Message = "POI not available locally";
                return;
            }

            // Navigate to poi detail
            var route = $"/poidetail?code={Uri.EscapeDataString(code)}&lang={Uri.EscapeDataString(poi.LanguageCode)}";
            await Shell.Current.GoToAsync(route);
        }
        finally
        {
            IsBusy = false;
        }
    }

    public async Task CancelAsync()
    {
        await Shell.Current.GoToAsync("..");
    }

    // Called by camera event handler to process scanned text
    public async Task HandleScannedCodeAsync(string scanned)
    {
        if (_isHandlingScan) return;
        _isHandlingScan = true;

        try
        {
            var parsed = QrResolver.Parse(scanned);
            if (!parsed.Success)
            {
                Message = parsed.Error ?? "Invalid QR";
                return;
            }

            var code = parsed.Code!;

            await _db.InitAsync();

            var preferredLang = _mapVm.CurrentLanguage;

            var poi = await _db.GetByCodeAsync(code, preferredLang);

            if (poi == null)
            {
                Message = "POI not available locally";
                return;
            }

            // Navigate to poi detail
            var route = $"/poidetail?code={Uri.EscapeDataString(code)}&lang={Uri.EscapeDataString(poi.LanguageCode)}";
            await Shell.Current.GoToAsync(route);
        }
        finally
        {
            _isHandlingScan = false;
        }
    }

    // NOTE: Camera scanning not implemented in Phase-1B due to missing scanner package.
    // This handler remains for future integration.
}
