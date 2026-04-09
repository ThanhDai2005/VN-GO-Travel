using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Input;
using MauiApp1.Models;
using MauiApp1.Services;
using Microsoft.Maui.ApplicationModel;
using Microsoft.Maui.Controls;

namespace MauiApp1.ViewModels;

/// <summary>High-level UX phase for QR scanner screen (camera + manual).</summary>
public enum QrScannerUxPhase
{
    Ready,
    Recognizing,
    OpeningPoi,
    InvalidFormat,
    NotFound,
    BusyRetry,
    ReadyAgain
}

public class QrScannerViewModel : INotifyPropertyChanged
{
    private readonly PoiEntryCoordinator _coordinator;
    private readonly MapViewModel _mapVm;

    private bool _isHandlingScan;
    private CancellationTokenSource? _errorResetCts;

    private string _inputText = string.Empty;
    private string _uxStatusText = "Đưa mã QR vào khung quét";
    private string _uxDetailError = string.Empty;
    private bool _isProcessingScan;
    private QrScannerUxPhase _uxPhase = QrScannerUxPhase.Ready;

    private string? _lastAcceptedNormalizedKey;
    private DateTime _lastAcceptedAtUtc = DateTime.MinValue;

    public QrScannerViewModel(PoiEntryCoordinator coordinator, MapViewModel mapVm)
    {
        _coordinator = coordinator;
        _mapVm = mapVm;
        ScanCommand = new Command(async () => await ScanAsync(), () => !IsProcessingScan);
        CancelCommand = new Command(async () => await CancelAsync());
    }

    public string InputText
    {
        get => _inputText;
        set { _inputText = value; OnPropertyChanged(); }
    }

    /// <summary>Legacy binding; prefer <see cref="UxDetailError"/> for error banner.</summary>
    public string Message
    {
        get => _uxDetailError;
        set { _uxDetailError = value; OnPropertyChanged(); OnPropertyChanged(nameof(HasDetailError)); }
    }

    public string UxStatusText
    {
        get => _uxStatusText;
        private set { _uxStatusText = value; OnPropertyChanged(); }
    }

    public string UxDetailError
    {
        get => _uxDetailError;
        private set
        {
            _uxDetailError = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(HasDetailError));
            OnPropertyChanged(nameof(Message));
        }
    }

    public bool HasDetailError => !string.IsNullOrEmpty(_uxDetailError);

    public bool IsProcessingScan
    {
        get => _isProcessingScan;
        private set
        {
            if (_isProcessingScan == value) return;
            _isProcessingScan = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(IsScannerAcceptingInput));
        }
    }

    /// <summary>Camera should be active; page drives IsDetecting using this + lifecycle.</summary>
    public bool IsScannerAcceptingInput => !IsProcessingScan;

    public QrScannerUxPhase UxPhase
    {
        get => _uxPhase;
        private set
        {
            if (_uxPhase == value) return;
            _uxPhase = value;
            OnPropertyChanged();
        }
    }

    public ICommand ScanCommand { get; }
    public ICommand CancelCommand { get; }

    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name ?? ""));

    /// <summary>Call when QR tab is shown again so prior cooldowns do not block legitimate rescans.</summary>
    public void SetCameraUnavailableMessage(string text)
    {
        UxStatusText = text;
        ApplyPhase(QrScannerUxPhase.ReadyAgain);
        Debug.WriteLine($"[QR-STATE] Camera unavailable UX: {text}");
    }

    public void ResetForPageAppearing()
    {
        _errorResetCts?.Cancel();
        _errorResetCts?.Dispose();
        _errorResetCts = null;

        _isHandlingScan = false;
        IsProcessingScan = false;
        UxDetailError = string.Empty;
        ApplyPhase(QrScannerUxPhase.Ready);
        UxStatusText = "Đưa mã QR vào khung quét";
        (ScanCommand as Command)?.ChangeCanExecute();
        Debug.WriteLine("[QR-STATE] Scanner reset completed (page appearing)");
    }

    public async Task ScanAsync()
    {
        await SubmitCodeAsync(InputText, "Manual");
    }

    public async Task CancelAsync()
    {
        await MainThread.InvokeOnMainThreadAsync(async () =>
        {
            await Shell.Current.GoToAsync("..");
        });
    }

    public Task<bool> HandleScannedCodeAsync(string scanned) =>
        SubmitCodeAsync(scanned, "Camera");

    private async Task<bool> SubmitCodeAsync(string rawText, string source)
    {
        Debug.WriteLine($"[QR-SCAN] SubmitCodeAsync enter source={source} main={MainThread.IsMainThread} handling={_isHandlingScan} processing={IsProcessingScan}");

        if (_isHandlingScan || IsProcessingScan)
        {
            Debug.WriteLine($"[QR-SCAN] Ignored: processing lock (VM) source={source}");
            return false;
        }

        _errorResetCts?.Cancel();

        _isHandlingScan = true;
        IsProcessingScan = true;
        UxDetailError = string.Empty;

        if (source == "Camera")
        {
            ApplyPhase(QrScannerUxPhase.Recognizing);
            UxStatusText = "Đang nhận diện mã...";
            Debug.WriteLine("[QR-STATE] Processing state entered (recognizing)");
            await Task.Yield();
        }

        UxStatusText = "Đang mở địa điểm...";
        ApplyPhase(QrScannerUxPhase.OpeningPoi);
        Debug.WriteLine("[QR-STATE] Opening POI phase (coordinator)");

        (ScanCommand as Command)?.ChangeCanExecute();

        var success = false;
        try
        {
            var request = new PoiEntryRequest
            {
                RawInput = rawText,
                Source = source == "Camera" ? PoiEntrySource.Scanner : PoiEntrySource.Manual,
                PreferredLanguage = _mapVm.CurrentLanguage,
                NavigationMode = source == "Camera"
                    ? PoiNavigationMode.Map
                    : PoiNavigationMode.Detail
            };

            Debug.WriteLine($"[QR-NAV] Opening POI flow via PoiEntryCoordinator source={source}");

            var result = await _coordinator.HandleEntryAsync(request);

            if (!result.Success)
            {
                Debug.WriteLine($"[QR-SCAN] Invalid or failed scan source={source} error={result.Error}");
                ApplyFailureUi(result.Error, source);
                return false;
            }

            if (!result.Navigated)
            {
                Debug.WriteLine("[QR-NAV] Navigation skipped (coordinator duplicate guard) — resume scanning");
                UxStatusText = "Sẵn sàng quét lại";
                ApplyPhase(QrScannerUxPhase.ReadyAgain);
                return false;
            }

            success = true;
            var preview = QrResolver.Parse(rawText);
            var key = preview.Success ? preview.Code! : rawText.Trim();
            _lastAcceptedNormalizedKey = key;
            _lastAcceptedAtUtc = DateTime.UtcNow;
            Debug.WriteLine($"[QR-SCAN] Accepted scan value={key} source={source}");
            Debug.WriteLine("[QR-NAV] Navigation completed (coordinator returned success)");
            return true;
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[QR-ERR] SubmitCodeAsync source={source}: {ex}");
            UxDetailError = "Đã xảy ra lỗi. Thử lại.";
            UxStatusText = "Sẵn sàng quét lại";
            ApplyPhase(QrScannerUxPhase.ReadyAgain);
            ScheduleErrorResetToReady();
            return false;
        }
        finally
        {
            _isHandlingScan = false;
            if (!success)
                IsProcessingScan = false;
            else
                Debug.WriteLine("[QR-STATE] Processing flag held until page leaves (success path)");

            (ScanCommand as Command)?.ChangeCanExecute();
            Debug.WriteLine($"[QR-SCAN] SubmitCodeAsync finally source={source} success={success} processing={IsProcessingScan}");
        }
    }

    /// <summary>When navigation succeeds, page calls this after returning so scanner is usable again.</summary>
    public void ReleaseProcessingAfterNavigationAway()
    {
        IsProcessingScan = false;
        ApplyPhase(QrScannerUxPhase.Ready);
        UxStatusText = "Đưa mã QR vào khung quét";
        (ScanCommand as Command)?.ChangeCanExecute();
        Debug.WriteLine("[QR-STATE] Scanner reset after navigation (released processing)");
    }

    private void ApplyFailureUi(string? error, string source)
    {
        if (string.Equals(error, "Busy", StringComparison.OrdinalIgnoreCase) || error?.Contains("Busy", StringComparison.OrdinalIgnoreCase) == true)
        {
            UxStatusText = "Đang xử lý, vui lòng đợi...";
            ApplyPhase(QrScannerUxPhase.BusyRetry);
            UxDetailError = string.Empty;
            Debug.WriteLine("[QR-STATE] Coordinator busy — soft retry state");
            ScheduleErrorResetToReady(900);
            return;
        }

        if (string.Equals(error, "POI not available locally", StringComparison.OrdinalIgnoreCase))
        {
            UxStatusText = "Không tìm thấy địa điểm";
            UxDetailError = "Mã hợp lệ nhưng chưa có trong ứng dụng.";
            ApplyPhase(QrScannerUxPhase.NotFound);
        }
        else
        {
            UxStatusText = "Không nhận diện được mã hợp lệ";
            UxDetailError = string.IsNullOrWhiteSpace(error) ? "Thử mã poi:CODE hoặc URL /poi/CODE." : error;
            ApplyPhase(QrScannerUxPhase.InvalidFormat);
        }

        ScheduleErrorResetToReady();
    }

    private void ScheduleErrorResetToReady(int delayMs = 2200)
    {
        _errorResetCts?.Cancel();
        _errorResetCts?.Dispose();
        _errorResetCts = new CancellationTokenSource();
        var token = _errorResetCts.Token;
        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(delayMs, token).ConfigureAwait(false);
                if (token.IsCancellationRequested) return;
                await MainThread.InvokeOnMainThreadAsync(() =>
                {
                    if (_isHandlingScan || IsProcessingScan) return;
                    ApplyPhase(QrScannerUxPhase.Ready);
                    UxStatusText = "Sẵn sàng quét lại";
                    UxDetailError = string.Empty;
                    Debug.WriteLine("[QR-STATE] Recovered to ready-to-scan after message");
                }).ConfigureAwait(false);
            }
            catch (OperationCanceledException) { /* expected */ }
        });
    }

    private void ApplyPhase(QrScannerUxPhase phase)
    {
        UxPhase = phase;
        Debug.WriteLine($"[QR-UX] Phase={phase}");
    }

    /// <summary>Normalized key for frame-level dedupe (POI code if parseable, else trimmed raw).</summary>
    public static string GetDedupeKey(string raw)
    {
        var p = QrResolver.Parse(raw);
        return p.Success ? p.Code! : raw.Trim();
    }
}
