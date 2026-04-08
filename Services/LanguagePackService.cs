using MauiApp1.Models;
using Microsoft.Maui.Storage;
using System.Collections.ObjectModel;
using System.Diagnostics;

namespace MauiApp1.Services;

/// <summary>
/// Manages language pack download state and network-aware download flows.
/// <para>
/// "Download" is simulated (Task.Delay + in-memory flag) since all content
/// is already bundled in pois.json. The architecture is ready for a real
/// CDN-based language pack system in the future.
/// </para>
/// "vi" and "en" are always pre-downloaded and cannot be removed.
/// All other languages are "downloadable" and require an explicit download step.
/// </summary>
public class LanguagePackService
{
    private static readonly string PrefKeyPrefix = "lang_pack_downloaded_";

    // Thread-safe lock so double-taps don't start two downloads.
    private readonly SemaphoreSlim _downloadGate = new(1, 1);

    public ObservableCollection<LanguagePack> Packs { get; } = new();

    // ── Simulated pack sizes shown to user before download ───────────────────
    private static readonly Dictionary<string, string> PackSizeLabels = new(StringComparer.OrdinalIgnoreCase)
    {
        ["vi"] = "Đã cài sẵn",
        ["en"] = "Pre-installed",
        ["ja"] = "~420 KB",
        ["ko"] = "~390 KB",
        ["fr"] = "~350 KB",
        ["zh"] = "~430 KB",
    };

    public LanguagePackService(IPreferredLanguageService langPrefs)
    {
        foreach (var info in PreferredLanguageService.SupportedLanguages)
        {
            var preinstalled = info.Code == "vi" || info.Code == "en";
            var persisted    = Preferences.Get(PrefKeyPrefix + info.Code, preinstalled);

            Packs.Add(new LanguagePack
            {
                Code        = info.Code,
                DisplayName = info.DisplayName,
                NativeName  = info.NativeName,
                SizeLabel   = PackSizeLabels.GetValueOrDefault(info.Code, "~300 KB"),
                State       = persisted ? DownloadState.Downloaded : DownloadState.NotDownloaded
            });

            Debug.WriteLine($"[LANG-PACK] Initialized: {info.Code} state={( persisted ? "Downloaded" : "NotDownloaded" )}");
        }

        // Load custom dynamic languages
        var customLangs = Preferences.Get("custom_dynamic_languages", "");
        if (!string.IsNullOrWhiteSpace(customLangs))
        {
            var codes = customLangs.Split(',', StringSplitOptions.RemoveEmptyEntries);
            foreach (var code in codes)
            {
                if (GetPack(code) == null)
                {
                    var nativeName = Preferences.Get($"custom_lang_{code}_native", code);
                    var displayName = Preferences.Get($"custom_lang_{code}_display", code);
                    
                    Packs.Add(new LanguagePack
                    {
                        Code = code,
                        DisplayName = displayName,
                        NativeName = nativeName,
                        SizeLabel = "On-demand",
                        State = DownloadState.Downloaded
                    });
                    Debug.WriteLine($"[LANG-PACK] Restored dynamic language: {code}");
                }
            }
        }
    }

    /// <summary>Returns the pack for the given language code, or null if not found.</summary>
    public LanguagePack? GetPack(string code)
        => Packs.FirstOrDefault(p => string.Equals(p.Code, code, StringComparison.OrdinalIgnoreCase));

    // ── Network detection ────────────────────────────────────────────────────

    public enum NetworkType { WiFi, Cellular, Offline }

    public static NetworkType GetCurrentNetworkType()
    {
        var access = Connectivity.Current.NetworkAccess;
        if (access != NetworkAccess.Internet && access != NetworkAccess.ConstrainedInternet)
            return NetworkType.Offline;

        var profiles = Connectivity.Current.ConnectionProfiles;
        if (profiles.Contains(ConnectionProfile.WiFi))
            return NetworkType.WiFi;
        if (profiles.Contains(ConnectionProfile.Cellular))
            return NetworkType.Cellular;

        // Ethernet / other — treat as WiFi-equivalent (auto download)
        return NetworkType.WiFi;
    }

    /// <summary>Adds a non-bundled language to the active pack list. It starts as Downloaded since it uses on-demand API, no bundle exists.</summary>
    public void AddDynamicLanguage(string code, string nativeName, string displayName)
    {
        if (GetPack(code) != null) return; // already added

        var pack = new LanguagePack
        {
            Code = code,
            DisplayName = displayName,
            NativeName = nativeName,
            SizeLabel = "On-demand",
            State = DownloadState.Downloaded
        };
        
        Packs.Add(pack);
        Preferences.Set(PrefKeyPrefix + code, true);

        // Keep a comma-separated list of added languages in Preferences so we load them next time.
        var customLangs = Preferences.Get("custom_dynamic_languages", "");
        var newList = string.IsNullOrWhiteSpace(customLangs) ? code : $"{customLangs},{code}";
        Preferences.Set("custom_dynamic_languages", newList);
        
        // Also save text info
        Preferences.Set($"custom_lang_{code}_native", nativeName);
        Preferences.Set($"custom_lang_{code}_display", displayName);
        
        Debug.WriteLine($"[LANG-PACK] Added dynamic language: {code}");
    }

    // ── Main API ─────────────────────────────────────────────────────────────

    public enum EnsureResult { Available, Downloading, UserCancelled, Offline, AlreadyDownloading }

    /// <summary>
    /// Ensures a language pack is available, handling network state and user prompts.
    /// <list type="bullet">
    ///   <item>Downloaded → returns <c>Available</c> immediately.</item>
    ///   <item>WiFi → downloads silently.</item>
    ///   <item>Cellular → shows confirmation alert first.</item>
    ///   <item>Offline → shows unavailable message, returns <c>Offline</c>.</item>
    ///   <item>Already downloading → returns <c>AlreadyDownloading</c> (no-op).</item>
    /// </list>
    /// </summary>
    public async Task<EnsureResult> EnsureAvailableAsync(string code, Page hostPage)
    {
        var pack = GetPack(code);
        if (pack == null)
        {
            Debug.WriteLine($"[LANG-PACK] EnsureAvailableAsync: unknown code={code}");
            return EnsureResult.Available; // treat unknown as available (fallback handles it)
        }

        if (pack.State == DownloadState.Downloaded)
        {
            Debug.WriteLine($"[LANG-PACK] {code}: already downloaded → Available");
            return EnsureResult.Available;
        }

        // Prevent duplicate download: if already in progress, bail.
        if (pack.State == DownloadState.Downloading)
        {
            Debug.WriteLine($"[LANG-PACK] {code}: already downloading → AlreadyDownloading");
            return EnsureResult.AlreadyDownloading;
        }

        // Check network
        var net = GetCurrentNetworkType();
        Debug.WriteLine($"[LANG-PACK] {code}: needs download, network={net}");

        if (net == NetworkType.Offline)
        {
            await MainThread.InvokeOnMainThreadAsync(() =>
                hostPage.DisplayAlert(
                    "Không có kết nối",
                    $"Gói ngôn ngữ '{pack.NativeName}' chưa tải về và thiết bị đang offline.",
                    "OK"));
            return EnsureResult.Offline;
        }

        if (net == NetworkType.Cellular)
        {
            var confirmed = await MainThread.InvokeOnMainThreadAsync(() =>
                hostPage.DisplayAlert(
                    "Tải gói ngôn ngữ",
                    $"Gói '{pack.NativeName}' ({pack.SizeLabel}) sẽ được tải qua dữ liệu di động. Tiếp tục?",
                    "Tải xuống",
                    "Huỷ"));
            if (!confirmed)
            {
                Debug.WriteLine($"[LANG-PACK] {code}: user cancelled cellular download");
                return EnsureResult.UserCancelled;
            }
        }

        // WiFi → silent download. Cellular → user confirmed. Start download.
        return await DownloadAsync(pack);
    }

    // ── Download simulation ──────────────────────────────────────────────────

    private async Task<EnsureResult> DownloadAsync(LanguagePack pack)
    {
        // Short-circuit if another caller started the download first (race condition guard).
        bool acquired = await _downloadGate.WaitAsync(0).ConfigureAwait(false);
        if (!acquired)
        {
            Debug.WriteLine($"[LANG-PACK] {pack.Code}: gate already held → AlreadyDownloading");
            return EnsureResult.AlreadyDownloading;
        }

        try
        {
            // Final check inside the gate.
            if (pack.State == DownloadState.Downloaded) return EnsureResult.Available;
            if (pack.State == DownloadState.Downloading) return EnsureResult.AlreadyDownloading;

            Debug.WriteLine($"[LANG-PACK] {pack.Code}: download started");
            await MainThread.InvokeOnMainThreadAsync(() => pack.State = DownloadState.Downloading);

            // Simulate network download (500ms – 1500ms).
            var delay = Random.Shared.Next(500, 1500);
            await Task.Delay(delay).ConfigureAwait(false);

            // In a real implementation: download & extract the language file here.
            // For now, just update state and persist.

            await MainThread.InvokeOnMainThreadAsync(() => pack.State = DownloadState.Downloaded);
            Preferences.Set(PrefKeyPrefix + pack.Code, true);

            Debug.WriteLine($"[LANG-PACK] {pack.Code}: download complete ({delay}ms)");
            return EnsureResult.Available;
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[LANG-PACK] {pack.Code}: download FAILED: {ex.Message}");
            await MainThread.InvokeOnMainThreadAsync(() => pack.State = DownloadState.Failed);
            return EnsureResult.Offline; // treat network failure like offline for UX
        }
        finally
        {
            _downloadGate.Release();
        }
    }
}
