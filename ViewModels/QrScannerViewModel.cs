using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Threading.Tasks;
using System.Windows.Input;
using MauiApp1.Services;
using Microsoft.Maui.ApplicationModel;
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
        await SubmitCodeAsync(InputText, source: "Manual");
    }

    public async Task CancelAsync()
    {
        await MainThread.InvokeOnMainThreadAsync(async () =>
        {
            await Shell.Current.GoToAsync("..");
        });
    }

    public async Task<bool> HandleScannedCodeAsync(string scanned)
    {
        return await SubmitCodeAsync(scanned, source: "Camera");
    }

    private async Task<bool> SubmitCodeAsync(string rawText, string source)
    {
        Debug.WriteLine($"[QR-NAV] SubmitCodeAsync enter source={source} thread={System.Threading.Thread.CurrentThread.ManagedThreadId} main={MainThread.IsMainThread} busy={IsBusy} handling={_isHandlingScan}");

        if (_isHandlingScan || IsBusy)
        {
            Debug.WriteLine($"[QR-NAV] SubmitCodeAsync early exit (already busy) source={source}");
            return false;
        }

        _isHandlingScan = true;
        IsBusy = true;
        Message = string.Empty;

        try
        {
            Debug.WriteLine($"[QR-NAV] Parse start rawLen={rawText?.Length ?? 0}");
            var parsed = QrResolver.Parse(rawText);
            if (!parsed.Success)
            {
                Message = parsed.Error ?? "Invalid QR";
                Debug.WriteLine($"[QR-NAV] Parse failed: {Message}");
                return false;
            }

            var code = parsed.Code!;
            Debug.WriteLine($"[QR-NAV] Parse ok code='{code}'");

            Debug.WriteLine("[QR-NAV] DB InitAsync before GetByCode");
            await _db.InitAsync();

            var preferredLang = _mapVm.CurrentLanguage;
            Debug.WriteLine($"[QR-NAV] GetByCode code='{code}' lang='{preferredLang}'");

            var poi = await _db.GetByCodeAsync(code, preferredLang);
            if (poi == null)
            {
                Message = "POI not available locally";
                Debug.WriteLine($"[QR-NAV] GetByCode returned null for code='{code}'");
                return false;
            }

            Debug.WriteLine($"[QR-NAV] POI resolved id={poi.Id} name={poi.Name}");

            // After scanning: focus directly on the map and auto-play the POI audio.
            _mapVm.RequestFocusOnPoiCode(code, poi.LanguageCode);

            var route = $"//map";
            Debug.WriteLine($"[QR-NAV] GoToAsync BEFORE route={route} source={source} main={MainThread.IsMainThread}");

            await MainThread.InvokeOnMainThreadAsync(async () =>
            {
                await Shell.Current.GoToAsync(route);
            });

            Debug.WriteLine($"[QR-NAV] GoToAsync AFTER (returned) source={source}");
            return true;
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[QR-ERR] SubmitCodeAsync source={source}: {ex}");
            return false;
        }
        finally
        {
            IsBusy = false;
            _isHandlingScan = false;
            Debug.WriteLine($"[QR-NAV] SubmitCodeAsync finally source={source} busy cleared");
        }
    }
}