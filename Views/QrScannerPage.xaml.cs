using System;
using System.ComponentModel;
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
    private const int InterFrameDedupeMs = 450;

    private readonly QrScannerViewModel _vm;
    private readonly object _barcodeSync = new();

    private bool _cameraSubmitInProgress;
    private string? _lastInterFrameKey;
    private DateTime _lastInterFrameAtUtc = DateTime.MinValue;

    private static int s_barcodeEventCount;
    private DateTime? _appearedAtUtc;
    private bool _firstBarcodeLogged;

    private CancellationTokenSource? _scanLineAnimCts;

    // Tracks whether we have subscribed to Window.Resumed so we don't double-subscribe.
    private bool _windowResumedSubscribed;
    // True after a first-time permission grant so TryStartCameraAsync knows to do a
    // hard camera restart (ZXing needs re-init if camera was never opened before).
    private bool _cameraStartedAtLeastOnce;

    public QrScannerPage(QrScannerViewModel vm)
    {
        InitializeComponent();
        BindingContext = _vm = vm;
        Debug.WriteLine($"[QR-UX] QrScannerPage ctor hash={GetHashCode()} thread={Thread.CurrentThread.ManagedThreadId} main={MainThread.IsMainThread}");
    }

    private void OnVmPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName != nameof(QrScannerViewModel.IsProcessingScan))
            return;

        MainThread.BeginInvokeOnMainThread(() =>
        {
            if (!IsVisible) return;
            if (_vm.IsProcessingScan)
            {
                TryStopScanLineAnimation();
                try
                {
                    if (CameraView != null)
                        CameraView.IsDetecting = false;
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[QR-ERR] Pause camera during processing: {ex}");
                }

                Debug.WriteLine("[QR-STATE] Scan line paused; camera detection paused (processing)");
            }
            else
            {
                try
                {
                    if (CameraView != null)
                        CameraView.IsDetecting = true;
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[QR-ERR] Resume camera after processing: {ex}");
                }

                if (CameraView is { IsDetecting: true })
                    TryStartScanLineAnimation();
            }
        });
    }

    private void TryStartScanLineAnimation()
    {
        if (_vm.IsProcessingScan || !IsVisible)
            return;

        _scanLineAnimCts?.Cancel();
        _scanLineAnimCts?.Dispose();
        _scanLineAnimCts = new CancellationTokenSource();
        var token = _scanLineAnimCts.Token;
        _ = RunScanLineAnimationAsync(token);
    }

    private void TryStopScanLineAnimation()
    {
        try
        {
            _scanLineAnimCts?.Cancel();
        }
        catch { /* ignore */ }
    }

    private async Task RunScanLineAnimationAsync(CancellationToken ct)
    {
        Debug.WriteLine("[QR-UX] Scan line animation loop started");
        try
        {
            while (!ct.IsCancellationRequested && IsVisible && !_vm.IsProcessingScan)
            {
                await MainThread.InvokeOnMainThreadAsync(async () =>
                {
                    if (ScanLine is null || ct.IsCancellationRequested) return;
                    ScanLine.TranslationY = 0;
                    await ScanLine.TranslateTo(0, 200, 1300, Easing.Linear);
                }).ConfigureAwait(false);
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[QR-ERR] Scan line animation: {ex}");
        }
        Debug.WriteLine("[QR-UX] Scan line animation loop ended");
    }

    private void TryConfigureCameraForQrOnly()
    {
        try
        {
            var cv = CameraView;
            if (cv == null) return;

            var t = cv.GetType();

            var pMultiple = t.GetProperty("Multiple");
            if (pMultiple != null && pMultiple.CanWrite && pMultiple.PropertyType == typeof(bool))
            {
                pMultiple.SetValue(cv, false);
                Debug.WriteLine("[QR-UX] Config: Multiple=false");
            }

            var pAutoRotate = t.GetProperty("AutoRotate");
            if (pAutoRotate != null && pAutoRotate.CanWrite && pAutoRotate.PropertyType == typeof(bool))
            {
                pAutoRotate.SetValue(cv, true);
                Debug.WriteLine("[QR-UX] Config: AutoRotate=true");
            }

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
                        Debug.WriteLine($"[QR-UX] Config: {camProp.Name}={name}");
                        break;
                    }
                    catch { }
                }
            }

            var formatProp = t.GetProperties().FirstOrDefault(p => p.Name.IndexOf("Format", StringComparison.OrdinalIgnoreCase) >= 0 && p.CanWrite);
            if (formatProp != null)
            {
                var ft = formatProp.PropertyType;
                if (ft.IsEnum)
                {
                    string[] qnames = { "QR_CODE", "QrCode", "QRCode", "QR" };
                    foreach (var qn in qnames)
                    {
                        try
                        {
                            var enumVal = Enum.Parse(ft, qn, ignoreCase: true);
                            formatProp.SetValue(cv, enumVal);
                            Debug.WriteLine($"[QR-UX] Config: {formatProp.Name}={qn}");
                            break;
                        }
                        catch { }
                    }
                }
                else if (ft == typeof(string))
                {
                    try { formatProp.SetValue(cv, "QR_CODE"); Debug.WriteLine($"[QR-UX] Config: {formatProp.Name}=QR_CODE"); } catch { }
                }
            }

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
                        if (pft.IsArray && pft.GetElementType()!.IsEnum)
                        {
                            var enumType = pft.GetElementType()!;
                            string[] qnames = { "QR_CODE", "QrCode", "QRCode", "QR" };
                            foreach (var qn in qnames)
                            {
                                try
                                {
                                    var ev = Enum.Parse(enumType, qn, ignoreCase: true);
                                    var arr = Array.CreateInstance(enumType, 1);
                                    arr.SetValue(ev, 0);
                                    pf.SetValue(opts, arr);
                                    Debug.WriteLine("[QR-UX] Config: PossibleFormats=QR array");
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
            Debug.WriteLine($"[QR-ERR] TryConfigureCameraForQrOnly: {ex}");
        }
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        _vm.PropertyChanged -= OnVmPropertyChanged;
        _vm.PropertyChanged += OnVmPropertyChanged;
        Debug.WriteLine("[QR-STATE] Scanner page appeared");
        _appearedAtUtc = DateTime.UtcNow;
        _firstBarcodeLogged = false;

        lock (_barcodeSync)
        {
            _cameraSubmitInProgress = false;
            _lastInterFrameKey = null;
            _lastInterFrameAtUtc = DateTime.MinValue;
        }

        _vm.ResetForPageAppearing();

        try { TryConfigureCameraForQrOnly(); }
        catch (Exception ex) { Debug.WriteLine($"[QR-ERR] TryConfigureCameraForQrOnly outer: {ex}"); }

        // Subscribe to Window.Resumed so we can re-check permission and restart
        // the camera when the Android OS permission dialog is dismissed.
        SubscribeWindowResumed();

        LogShellState("[QR-LIFE] OnAppearing start");
        LogShortState("[QR-STATE] OnAppearing short state");

        await TryStartCameraAsync(reason: "OnAppearing");

        LogShellState("[QR-LIFE] OnAppearing end");
    }

    // ── Window.Resumed subscription ───────────────────────────────────────────
    // On Android the OS permission dialog runs in the same Activity but still
    // causes onPause/onResume in the Activity lifecycle. MAUI maps onResume
    // to Window.Resumed. This is the reliable hook to know
    // "user just came back from the Allow/Deny dialog".

    private void SubscribeWindowResumed()
    {
        if (_windowResumedSubscribed) return;
        try
        {
            var win = Application.Current?.Windows?.FirstOrDefault();
            if (win == null) return;
            win.Resumed += OnWindowResumed;
            _windowResumedSubscribed = true;
            Debug.WriteLine("[QR-PERM] Window.Resumed subscribed");
        }
        catch (Exception ex) { Debug.WriteLine($"[QR-ERR] SubscribeWindowResumed: {ex}"); }
    }

    private void UnsubscribeWindowResumed()
    {
        try
        {
            var win = Application.Current?.Windows?.FirstOrDefault();
            if (win == null) return;
            win.Resumed -= OnWindowResumed;
            _windowResumedSubscribed = false;
            Debug.WriteLine("[QR-PERM] Window.Resumed unsubscribed");
        }
        catch (Exception ex) { Debug.WriteLine($"[QR-ERR] UnsubscribeWindowResumed: {ex}"); }
    }

    private async void OnWindowResumed(object? sender, EventArgs e)
    {
        // Only react when this page is the visible one.
        if (!IsVisible) return;

        Debug.WriteLine("[QR-PERM] Window.Resumed fired — re-checking camera permission");
        try
        {
            // Small delay: let Android finish transferring camera ownership back to the app.
            await Task.Delay(300).ConfigureAwait(false);

            if (!IsVisible) return;     // user navigated away during delay

            var status = await Permissions.CheckStatusAsync<Permissions.Camera>().ConfigureAwait(false);
            Debug.WriteLine($"[QR-PERM] Window.Resumed — permission={status}");

            if (status == PermissionStatus.Granted)
            {
                await MainThread.InvokeOnMainThreadAsync(async () =>
                {
                    if (!IsVisible) return;
                    Debug.WriteLine("[QR-PERM] Camera permission confirmed after resume — restarting");
                    await TryStartCameraAsync(reason: "Window.Resumed");
                });
            }
        }
        catch (Exception ex) { Debug.WriteLine($"[QR-ERR] OnWindowResumed: {ex}"); }
    }

    // ── Camera start ─────────────────────────────────────────────────────────

    private void RecreateCameraView()
    {
        try
        {
            if (CameraContainer != null && CameraView != null)
            {
                Debug.WriteLine("[QR-STATE] Completely recreating CameraView instance to force native CameraX re-init");
                
                CameraView.BarcodesDetected -= OnBarcodesDetected;
                CameraContainer.Children.Remove(CameraView);
                
                CameraView = new ZXing.Net.Maui.Controls.CameraBarcodeReaderView
                {
                    IsDetecting = false
                };
                CameraView.BarcodesDetected += OnBarcodesDetected;
                
                // Insert at the bottom (index 0) so the scanning line and text stay on top
                CameraContainer.Children.Insert(0, CameraView);
            }
            else
            {
                Debug.WriteLine("[QR-ERR] RecreateCameraView failed: Container or View is null");
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[QR-ERR] RecreateCameraView exception: {ex}");
        }
    }

    /// <summary>
    /// Checks camera permission, requests it if needed, and starts the ZXing scanner.
    /// Safe to call on every <c>OnAppearing</c> and after <c>Window.Resumed</c>.
    /// <para>
    /// When permission is granted for the first time during this session, a hard restart
    /// is performed (IsDetecting toggle with extended delay) because ZXing’s native camera
    /// handler was never initialised before and a simple <c>IsDetecting = true</c> is
    /// insufficient to open the hardware camera on Android.
    /// </para>
    /// </summary>
    private async Task TryStartCameraAsync(string reason = "")
    {
        try
        {
            Debug.WriteLine($"[QR-PERM] TryStartCameraAsync reason={reason}");
            var status = await Permissions.CheckStatusAsync<Permissions.Camera>().ConfigureAwait(false);
            Debug.WriteLine($"[QR-PERM] Permission status={status}");

            if (status != PermissionStatus.Granted)
            {
                Debug.WriteLine("[QR-PERM] Requesting camera permission");
                status = await Permissions.RequestAsync<Permissions.Camera>().ConfigureAwait(false);
                Debug.WriteLine($"[QR-PERM] Permission result after request: {status}");
            }

            if (status != PermissionStatus.Granted)
            {
                Debug.WriteLine("[QR-PERM] Camera permission denied — showing fallback UI");
                await MainThread.InvokeOnMainThreadAsync(() =>
                    _vm.SetCameraUnavailableMessage("Kh\u00f4ng c\u00f3 quy\u1ec1n camera \u2014 d\u00f9ng nh\u1eadp tay b\u00ean d\u01b0\u1edbi."));
                return;
            }

            Debug.WriteLine($"[QR-PERM] Camera permission granted. firstTime={!_cameraStartedAtLeastOnce}");

            await MainThread.InvokeOnMainThreadAsync(async () =>
            {
                if (CameraView == null)
                {
                    Debug.WriteLine("[QR-ERR] CameraView is null — cannot start camera");
                    return;
                }

                if (!_cameraStartedAtLeastOnce)
                {
                    // First-time camera start within this page session.
                    // ZXing’s native handler may not have acquired the camera hardware yet
                    // (it was created before permission was granted, resulting in a black preview
                    // that ignores IsDetecting=true).
                    // We must recreate the entire object to force MAUI to bind a new native view.
                    Debug.WriteLine("[QR-PERM] Hard camera restart (first grant) via recreation");
                    await Task.Delay(200);   // wait briefly for OS camera release
                    RecreateCameraView();
                    TryConfigureCameraForQrOnly();
                    CameraView.IsDetecting = true;
                    _cameraStartedAtLeastOnce = true;
                    Debug.WriteLine("[QR-STATE] Camera started (first-time)");
                }
                else
                {
                    // Camera was already started; resume normally with a shorter delay.
                    await StartDetectingWithStabilizationAsync(350);
                    Debug.WriteLine("[QR-STATE] Camera resumed");
                }

                TryStartScanLineAnimation();
                Debug.WriteLine("[QR-STATE] Scanner activated successfully");
            });
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[QR-ERR] TryStartCameraAsync: {ex}");
        }
    }

    protected override void OnDisappearing()
    {
        base.OnDisappearing();
        Debug.WriteLine("[QR-STATE] Scanner page disappeared");
        LogShellState("[QR-LIFE] OnDisappearing start");

        // Unsubscribe Window.Resumed to prevent leaks when navigating away.
        UnsubscribeWindowResumed();
        _cameraStartedAtLeastOnce = false;  // reset so next OnAppearing starts fresh

        TryStopScanLineAnimation();
        _vm.ReleaseProcessingAfterNavigationAway();

        lock (_barcodeSync)
        {
            _cameraSubmitInProgress = false;
        }

        try
        {
            if (CameraView != null)
            {
                MainThread.BeginInvokeOnMainThread(() =>
                {
                    try
                    {
                        CameraView.IsDetecting = false;
                        Debug.WriteLine("[QR-STATE] Scanner deactivated (page left)");
                    }
                    catch (Exception ex)
                    {
                        Debug.WriteLine($"[QR-ERR] IsDetecting=false: {ex}");
                    }
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
                Debug.WriteLine("[QR-UX] Camera view ready");
            else
                Debug.WriteLine("[QR-ERR] CameraView is null");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[QR-ERR] EnsureScannerCreatedAsync: {ex}");
        }

        return Task.CompletedTask;
    }

    private async Task StartDetectingWithStabilizationAsync(int stabilizeMs = 350)
    {
        try
        {
            if (CameraView == null) return;

            try { await MainThread.InvokeOnMainThreadAsync(() => CameraView.IsDetecting = false); } catch { }

            if (stabilizeMs > 0)
                await Task.Delay(stabilizeMs);

            try { TryConfigureCameraForQrOnly(); } catch { }

            await MainThread.InvokeOnMainThreadAsync(() => CameraView.IsDetecting = true);
            Debug.WriteLine($"[QR-STATE] IsDetecting=true after {stabilizeMs}ms stabilization");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[QR-ERR] StartDetectingWithStabilizationAsync: {ex}");
        }
    }

    private async void OnBarcodesDetected(object? sender, object e)
    {
        s_barcodeEventCount++;
        if (s_barcodeEventCount % 12 == 0)
            Debug.WriteLine($"[QR-SCAN] BarcodesDetected event #{s_barcodeEventCount} (sparse)");

        if (e is not ZXing.Net.Maui.BarcodeDetectionEventArgs args)
        {
            Debug.WriteLine("[QR-SCAN] Unexpected event args type");
            return;
        }

        var first = args.Results?.FirstOrDefault();
        if (first == null)
            return;

        var value = first.Value?.Trim();
        if (string.IsNullOrWhiteSpace(value))
            return;

        await MainThread.InvokeOnMainThreadAsync(() => ProcessBarcodeOnMainThread(value));
    }

    private void ProcessBarcodeOnMainThread(string value)
    {
        Debug.WriteLine($"[QR-SCAN] Raw barcode detected value={TruncateForLog(value, 160)}");

        if (!_firstBarcodeLogged && _appearedAtUtc.HasValue)
        {
            var sinceAppearMs = (DateTime.UtcNow - _appearedAtUtc.Value).TotalMilliseconds;
            Debug.WriteLine($"[QR-TIME] First barcode after appear: {sinceAppearMs:F0} ms");
            _firstBarcodeLogged = true;
        }

        lock (_barcodeSync)
        {
            if (_cameraSubmitInProgress || _vm.IsProcessingScan)
            {
                Debug.WriteLine("[QR-SCAN] Ignored: processing lock (page or VM)");
                return;
            }

            var dedupeKey = QrScannerViewModel.GetDedupeKey(value);
            var now = DateTime.UtcNow;
            if (dedupeKey == _lastInterFrameKey
                && (now - _lastInterFrameAtUtc).TotalMilliseconds < InterFrameDedupeMs)
            {
                Debug.WriteLine($"[QR-SCAN] Ignored duplicate scan within cooldown window key={dedupeKey}");
                return;
            }

            _lastInterFrameKey = dedupeKey;
            _lastInterFrameAtUtc = now;
            _cameraSubmitInProgress = true;
        }

        TryStopScanLineAnimation();

        try
        {
            if (CameraView != null)
                CameraView.IsDetecting = false;
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[QR-ERR] Stop detecting: {ex}");
        }

        Debug.WriteLine("[QR-STATE] Scanner deactivated (accepted frame, processing)");

        _ = Task.Run(async () =>
        {
            var success = await HandleScannedValueAsync(value);

            await MainThread.InvokeOnMainThreadAsync(() =>
            {
                LogShortState("[QR-STATE] After handle scanned");

                if (!success && IsVisible && CameraView != null)
                {
                    try
                    {
                        CameraView.IsDetecting = true;
                        Debug.WriteLine("[QR-STATE] Scanner activated (after failed or skipped scan)");
                    }
                    catch (Exception ex)
                    {
                        Debug.WriteLine($"[QR-ERR] Resume detecting: {ex}");
                    }

                    TryStartScanLineAnimation();
                }

                if (!success && IsVisible)
                {
                    lock (_barcodeSync)
                    {
                        _cameraSubmitInProgress = false;
                    }
                    Debug.WriteLine("[QR-STATE] Scanner reset completed (failure path)");
                }
            });
        });
    }

    private async Task<bool> HandleScannedValueAsync(string value)
    {
        LogShellState("[QR-NAV] HandleScannedValueAsync start");
        try
        {
            await MainThread.InvokeOnMainThreadAsync(() => _vm.InputText = value);
            Debug.WriteLine("[QR-NAV] Opening POI flow from camera scan");

            var vmResult = await _vm.HandleScannedCodeAsync(value);

            Debug.WriteLine($"[QR-NAV] HandleScannedCodeAsync finished success={vmResult}");
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
                return;

            await MainThread.InvokeOnMainThreadAsync(() => { CameraView.IsDetecting = false; });
            await Task.Delay(150);
            await MainThread.InvokeOnMainThreadAsync(() => { CameraView.IsDetecting = true; });

            if (!_vm.IsProcessingScan)
                TryStartScanLineAnimation();
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[QR-ERR] RestartScannerAsync: {ex}");
        }
    }
}
