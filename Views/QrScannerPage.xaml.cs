using System;
using System.Diagnostics;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MauiApp1.ViewModels;
using Microsoft.Maui.ApplicationModel;
using Microsoft.Maui.Controls;

namespace MauiApp1.Views;

public partial class QrScannerPage : ContentPage
{
    private readonly QrScannerViewModel _vm;
    private bool _cameraSubmitInProgress;
    private static int s_barcodeEventCount;

    private string? _lastScannedValue;
    private DateTime _lastScannedAtUtc = DateTime.MinValue;
    private DateTime? _appearedAtUtc;
    private bool _firstBarcodeLogged;

    public QrScannerPage(QrScannerViewModel vm)
    {
        InitializeComponent();
        BindingContext = _vm = vm;
        Debug.WriteLine($"[QR-LIFE] QrScannerPage ctor hash={GetHashCode()} thread={Thread.CurrentThread.ManagedThreadId} main={MainThread.IsMainThread}");
    }

    // Best-effort configuration of CameraBarcodeReaderView to prefer QR-only and performance options.
    // Uses reflection so it won't fail if running with a different ZXing version.
    private void TryConfigureCameraForQrOnly()
    {
        try
        {
            var cv = CameraView;
            if (cv == null) return;

            var t = cv.GetType();

            // 1) Try set Multiple = false
            var pMultiple = t.GetProperty("Multiple");
            if (pMultiple != null && pMultiple.CanWrite && pMultiple.PropertyType == typeof(bool))
            {
                pMultiple.SetValue(cv, false);
                Debug.WriteLine("[QR] Config: set Multiple=false");
            }

            // 2) Try set AutoRotate = true
            var pAutoRotate = t.GetProperty("AutoRotate");
            if (pAutoRotate != null && pAutoRotate.CanWrite && pAutoRotate.PropertyType == typeof(bool))
            {
                pAutoRotate.SetValue(cv, true);
                Debug.WriteLine("[QR] Config: set AutoRotate=true");
            }

            // 3) Try set camera to Rear/Back if property exists
            var camProp = t.GetProperty("CameraLocation") ?? t.GetProperty("CameraFacing") ?? t.GetProperty("Camera");
            if (camProp != null && camProp.CanWrite && camProp.PropertyType.IsEnum)
            {
                var enumType = camProp.PropertyType;
                string[] candidates = { "Rear", "Back", "BackCamera", "RearCamera" };
                foreach (var name in candidates)
                {
                    try
                    {
                        var val = Enum.Parse(enumType, name, ignoreCase: true);
                        camProp.SetValue(cv, val);
                        Debug.WriteLine($"[QR] Config: set {camProp.Name}={name}");
                        break;
                    }
                    catch { }
                }
            }

            // 4) Try find direct format property (e.g., "Formats", "BarcodeFormats") and set QR-only if enum
            var formatProp = t.GetProperties().FirstOrDefault(p => p.Name.IndexOf("Format", StringComparison.OrdinalIgnoreCase) >= 0 && p.CanWrite);
            if (formatProp != null)
            {
                var ft = formatProp.PropertyType;
                if (ft.IsEnum)
                {
                    // Try common names for QR
                    string[] qnames = { "QR_CODE", "QrCode", "QRCode", "QR" };
                    foreach (var qn in qnames)
                    {
                        try
                        {
                            var enumVal = Enum.Parse(ft, qn, ignoreCase: true);
                            formatProp.SetValue(cv, enumVal);
                            Debug.WriteLine($"[QR] Config: set {formatProp.Name}={qn}");
                            break;
                        }
                        catch { }
                    }
                }
                else if (ft == typeof(string))
                {
                    try { formatProp.SetValue(cv, "QR_CODE"); Debug.WriteLine($"[QR] Config: set {formatProp.Name}=QR_CODE"); } catch { }
                }
            }

            // 5) If there's a nested BarcodeReaderOptions or ReaderOptions type, try to set PossibleFormats within it
            var optionsProp = t.GetProperty("BarcodeReaderOptions") ?? t.GetProperty("ReaderOptions") ?? t.GetProperty("Options");
            if (optionsProp != null && optionsProp.CanRead)
            {
                var opts = optionsProp.GetValue(cv);
                if (opts != null)
                {
                    var ot = opts.GetType();
                    var pf = ot.GetProperty("PossibleFormats") ?? ot.GetProperty("Formats");
                    if (pf != null && pf.CanWrite)
                    {
                        var pft = pf.PropertyType;
                        if (pft.IsArray && pft.GetElementType().IsEnum)
                        {
                            var enumType = pft.GetElementType();
                            string[] qnames = { "QR_CODE", "QrCode", "QRCode", "QR" };
                            foreach (var qn in qnames)
                            {
                                try
                                {
                                    var ev = Enum.Parse(enumType, qn, ignoreCase: true);
                                    var arr = Array.CreateInstance(enumType, 1);
                                    arr.SetValue(ev, 0);
                                    pf.SetValue(opts, arr);
                                    Debug.WriteLine("[QR] Config: set PossibleFormats to QR array");
                                    break;
                                }
                                catch { }
                            }
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[QR-ERR] TryConfigureCameraForQrOnly reflection: {ex}");
        }
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        Debug.WriteLine("[QR-LIFE] OnAppearing - Trang QR bắt đầu hiển thị");
        _appearedAtUtc = DateTime.UtcNow;
        Debug.WriteLine($"[QR-TIME] QrScannerPage OnAppearing at {_appearedAtUtc:O}");

        _cameraSubmitInProgress = false;
        // Try to configure camera/decoder for QR-only to improve sensitivity (best-effort, reflection)
        try
        {
            TryConfigureCameraForQrOnly();
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[QR-ERR] TryConfigureCameraForQrOnly: {ex}");
        }


        LogShellState("[QR-LIFE] OnAppearing start");
        Debug.WriteLine($"[QR-LIFE] IsVisible={IsVisible} CameraView null?={CameraView == null} IsDetecting(before)={(CameraView == null ? "n/a" : CameraView.IsDetecting.ToString())}");
        LogShortState("[QR] ShortState OnAppearing");

        SetDiag("QR page appeared");

        try
        {
            SetDiag("Requesting camera permission");
            Debug.WriteLine("[QR] Requesting camera permission");

            var status = await Permissions.CheckStatusAsync<Permissions.Camera>();
            var requestedNow = false;

            if (status != PermissionStatus.Granted)
            {
                status = await Permissions.RequestAsync<Permissions.Camera>();
                requestedNow = true;
            }

            SetDiag($"Permission result: {status}");
            Debug.WriteLine($"[QR] Permission result: {status}");

            if (status != PermissionStatus.Granted)
            {
                SetDiag("Permission denied - manual fallback only");
                Debug.WriteLine("[QR] Permission denied");
                return;
            }

            await EnsureScannerCreatedAsync();

            // Start detecting after short stabilization to improve autofocus/reliability
            await StartDetectingWithStabilizationAsync(350);

            if (requestedNow)
            {
                Debug.WriteLine("[QR-LIFE] Camera permission granted just now -> restarting scanner");
                await Task.Delay(250);
                await RestartScannerAsync("first grant");
            }
        }
        catch (Exception ex)
        {
            SetDiag("Permission check/request failed");
            Debug.WriteLine($"[QR-ERR] Permission check/request failed: {ex}");
        }

        LogShellState("[QR-LIFE] OnAppearing end");
    }

    protected override void OnDisappearing()
    {
        base.OnDisappearing();
        LogShellState("[QR-LIFE] OnDisappearing start");

        _cameraSubmitInProgress = false;

        SetDiag("QR page disappearing");
        Debug.WriteLine($"[QR-LIFE] OnDisappearing IsVisible={IsVisible}");

        try
        {
            if (CameraView != null)
            {
                MainThread.BeginInvokeOnMainThread(() =>
                {
                    Debug.WriteLine("[QR] Before IsDetecting=false (cleanup on leave)");
                    CameraView.IsDetecting = false;
                    Debug.WriteLine("[QR] After IsDetecting=false");
                });
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[QR-ERR] OnDisappearing camera cleanup: {ex}");
        }

        LogShellState("[QR-LIFE] OnDisappearing end");
    }

    private Task EnsureScannerCreatedAsync()
    {
        try
        {
            if (CameraView != null)
            {
                // Do not start detecting immediately here. We'll start detection after camera stabilization
                Debug.WriteLine("[QR] EnsureScannerCreatedAsync: CameraView available (will start detecting after stabilization)");
                SetDiag("Scanner created");
            }
            else
            {
                Debug.WriteLine("[QR-ERR] CameraView is null in EnsureScannerCreatedAsync");
            }
        }
        catch (Exception ex)
        {
            SetDiag("Failed to start scanner");
            Debug.WriteLine($"[QR-ERR] Scanner start: {ex}");
        }

        return Task.CompletedTask;
    }

    // Start detection after a short stabilization period to allow camera autofocus/preview to settle.
    private async Task StartDetectingWithStabilizationAsync(int stabilizeMs = 350)
    {
        try
        {
            if (CameraView == null) return;

            // Ensure detector is off first
            try { await MainThread.InvokeOnMainThreadAsync(() => CameraView.IsDetecting = false); } catch { }

            // Small stabilization delay to let camera auto-focus and preview warm up.
            if (stabilizeMs > 0)
                await Task.Delay(stabilizeMs);

            // Try configure QR-only again in case camera implementation needs properties set after creation
            try { TryConfigureCameraForQrOnly(); } catch { }

            // Start detecting on main thread
            await MainThread.InvokeOnMainThreadAsync(() => CameraView.IsDetecting = true);
            Debug.WriteLine($"[QR] StartDetectingWithStabilization: IsDetecting set true after {stabilizeMs}ms");
            SetDiag("Scanner detecting started");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[QR-ERR] StartDetectingWithStabilizationAsync: {ex}");
        }
    }

    private async void OnBarcodesDetected(object sender, object e)
    {
        // Minimal per-event logging to avoid slowing the decode pipeline
        s_barcodeEventCount++;
        if (s_barcodeEventCount % 10 == 0)
            Debug.WriteLine($"[QR] BarcodesDetected #{s_barcodeEventCount} (sparse log) main={MainThread.IsMainThread}");

        if (e is not ZXing.Net.Maui.BarcodeDetectionEventArgs args)
        {
            Debug.WriteLine("[QR] BarcodesDetected: unexpected event args type");
            return;
        }

        var first = args.Results?.FirstOrDefault();
        if (first == null)
        {
            Debug.WriteLine("[QR] BarcodesDetected: no results");
            return;
        }

        var value = first.Value?.Trim();
        if (string.IsNullOrWhiteSpace(value))
        {
            Debug.WriteLine("[QR] BarcodesDetected: empty value");
            return;
        }

        Debug.WriteLine($"[QR] BarcodesDetected raw (len={value.Length}) preview={TruncateForLog(value)}");

        // Log time from page appearing to first barcode detection
        if (!_firstBarcodeLogged && _appearedAtUtc.HasValue)
        {
            var sinceAppearMs = (DateTime.UtcNow - _appearedAtUtc.Value).TotalMilliseconds;
            Debug.WriteLine($"[QR-TIME] Time from QrScanner OnAppearing to first barcode event = {sinceAppearMs} ms");
            _firstBarcodeLogged = true;
        }

        if (_cameraSubmitInProgress)
        {
            Debug.WriteLine("[QR] BarcodesDetected skipped: _cameraSubmitInProgress already true");
            return;
        }

        var now = DateTime.UtcNow;
        // reduce duplicate suppression window to 1s for snappier re-detection while still preventing immediate dupes
        if (_lastScannedValue == value && (now - _lastScannedAtUtc).TotalSeconds < 1)
        {
            Debug.WriteLine("[QR] BarcodesDetected skipped: duplicate within 1s");
            return;
        }

        _cameraSubmitInProgress = true;
        _lastScannedValue = value;
        _lastScannedAtUtc = now;

        try
        {
            // Pause camera detection quickly on UI thread, then do heavy work off UI thread
            if (CameraView != null)
            {
                await MainThread.InvokeOnMainThreadAsync(() =>
                {
                    try { CameraView.IsDetecting = false; } catch { }
                });
            }

            // Light log before heavy processing
            Debug.WriteLine("[QR] HandleScannedValueAsync scheduled (background)");

            // Run processing off the UI thread to avoid blocking camera decode pipeline
            _ = Task.Run(async () =>
            {
                var success = await HandleScannedValueAsync(value);

                // Minimal UI updates after processing
                await MainThread.InvokeOnMainThreadAsync(() =>
                {
                    LogShortState("[QR] ShortState AfterHandleScannedValue");
                    if (!success && IsVisible && CameraView != null)
                    {
                        try { CameraView.IsDetecting = true; } catch { }
                    }

                    if (IsVisible)
                        _cameraSubmitInProgress = false;
                });
            });
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[QR-ERR] OnBarcodesDetected scheduling: {ex}");
            // try to resume detector if possible
            try
            {
                if (IsVisible && CameraView != null)
                {
                    await MainThread.InvokeOnMainThreadAsync(() => CameraView.IsDetecting = true);
                }
            }
            catch { }
            _cameraSubmitInProgress = false;
        }
    }

    private async Task<bool> HandleScannedValueAsync(string value)
    {
        LogShellState("[QR-NAV] HandleScannedValueAsync start");
        Debug.WriteLine($"[QR-NAV] HandleScannedValueAsync value len={value?.Length ?? 0} IsVisible={IsVisible} _cameraSubmitInProgress={_cameraSubmitInProgress}");

        try
        {
            _vm.InputText = value;
            Debug.WriteLine("[QR-NAV] Before HandleScannedCodeAsync (VM)");

            // Call VM handler which now returns success flag
            var vmResult = await _vm.HandleScannedCodeAsync(value);

            Debug.WriteLine("[QR-NAV] After HandleScannedCodeAsync (VM)");
            return vmResult;
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[QR-ERR] HandleScannedValueAsync: {ex}");
            return false;
        }
        finally
        {
            LogShellState("[QR-NAV] HandleScannedValueAsync end");
        }
    }

    private static string TruncateForLog(string s, int max = 80)
    {
        if (string.IsNullOrEmpty(s)) return "";
        s = s.Replace('\r', ' ').Replace('\n', ' ');
        return s.Length <= max ? s : s[..max] + "...";
    }

    private static void LogShellState(string tag)
    {
        try
        {
            var shell = Shell.Current;
            if (shell == null)
            {
                Debug.WriteLine($"{tag} Shell.Current=null");
                return;
            }

            var loc = shell.CurrentState?.Location?.ToString() ?? "(null)";
            var nav = shell.Navigation;
            var stack = nav?.NavigationStack?.Count ?? -1;
            var modal = nav?.ModalStack?.Count ?? -1;
            Debug.WriteLine($"{tag} Shell.Location={loc} NavStack={stack} ModalStack={modal} main={MainThread.IsMainThread}");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[QR-ERR] LogShellState: {ex}");
        }
    }

    private void SetDiag(string text)
    {
        try
        {
            MainThread.BeginInvokeOnMainThread(() => DiagLabel.Text = text);
        }
        catch
        {
            // Ignore
        }
    }

    private void LogShortState(string tag)
    {
        try
        {
            var isVisible = IsVisible;
            var isDetecting = CameraView == null ? (bool?)null : CameraView.IsDetecting;
            var shell = Shell.Current;
            var loc = shell?.CurrentState?.Location?.ToString() ?? "(null)";
            var nav = shell?.Navigation;
            var stack = nav?.NavigationStack?.Count ?? -1;
            var modal = nav?.ModalStack?.Count ?? -1;
            Debug.WriteLine($"{tag} Visible={isVisible} IsDetecting={(isDetecting.HasValue ? isDetecting.ToString() : "n/a")} Shell.Location={loc} NavStack={stack} ModalStack={modal} main={MainThread.IsMainThread}");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[QR-ERR] LogShortState: {ex}");
        }
    }

    private async Task RestartScannerAsync(string reason)
    {
        try
        {
            Debug.WriteLine($"[QR-LIFE] RestartScannerAsync reason={reason}");

            if (CameraView == null)
            {
                Debug.WriteLine("[QR-ERR] RestartScannerAsync: CameraView is null");
                return;
            }

            await MainThread.InvokeOnMainThreadAsync(() =>
            {
                CameraView.IsDetecting = false;
                Debug.WriteLine("[QR] RestartScannerAsync -> IsDetecting=false");
            });

            await Task.Delay(150);

            await MainThread.InvokeOnMainThreadAsync(() =>
            {
                CameraView.IsDetecting = true;
                Debug.WriteLine("[QR] RestartScannerAsync -> IsDetecting=true");
            });

            Debug.WriteLine("[QR-LIFE] RestartScannerAsync completed");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[QR-ERR] RestartScannerAsync: {ex}");
        }
    }
}