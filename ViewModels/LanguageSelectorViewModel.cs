using MauiApp1.Models;
using MauiApp1.Services;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Windows.Input;

namespace MauiApp1.ViewModels;

/// <summary>
/// ViewModel for <see cref="MauiApp1.Views.LanguageSelectorPage"/>.
/// Handles the full flow:
///   1. User taps a language row.
///   2. Check if pack is downloaded via <see cref="LanguagePackService"/>.
///   3. Run network-aware download if needed.
///   4. On success, call <see cref="MapViewModel.ApplyLanguageSelectionAsync"/>.
///   5. Close the modal.
/// </summary>
public class LanguageSelectorViewModel : INotifyPropertyChanged
{
    private readonly MapViewModel _mapVm;
    private readonly LanguagePackService _packService;

    public System.Collections.ObjectModel.ObservableCollection<LanguagePack> Packs
        => _packService.Packs;

    private string _currentCode = "";
    public string CurrentCode
    {
        get => _currentCode;
        set { _currentCode = value; OnPropertyChanged(); }
    }

    private bool _isBusy;
    public bool IsBusy
    {
        get => _isBusy;
        private set { _isBusy = value; OnPropertyChanged(); }
    }

    /// <summary>Raised when the modal should close (language was successfully applied or user dismissed).</summary>
    public event EventHandler? RequestClose;

    public ICommand SelectLanguageCommand { get; }

    public LanguageSelectorViewModel(MapViewModel mapVm, LanguagePackService packService)
    {
        _mapVm       = mapVm;
        _packService  = packService;
        _currentCode  = mapVm.CurrentLanguage;

        SelectLanguageCommand = new Command<LanguagePack>(
            execute:  async pack => await OnLanguageSelectedAsync(pack),
            canExecute: pack => pack?.CanSelect ?? false);
    }

    private async Task OnLanguageSelectedAsync(LanguagePack? pack)
    {
        if (pack == null || IsBusy) return;

        // If the same language is already active, just close.
        if (string.Equals(pack.Code, _currentCode, StringComparison.OrdinalIgnoreCase))
        {
            RequestClose?.Invoke(this, EventArgs.Empty);
            return;
        }

        IsBusy = true;
        Debug.WriteLine($"[LANG-SEL] User selected: {pack.Code} (state={pack.State})");

        try
        {
            // Get the host page for displaying system alerts.
            var hostPage = Application.Current?.Windows.FirstOrDefault()?.Page
                           ?? Shell.Current;

            var result = await _packService.EnsureAvailableAsync(pack.Code, hostPage!);
            Debug.WriteLine($"[LANG-SEL] EnsureAvailable result={result} for code={pack.Code}");

            switch (result)
            {
                case LanguagePackService.EnsureResult.Available:
                    // Apply the language change and close the modal.
                    await _mapVm.ApplyLanguageSelectionAsync(pack.Code);
                    CurrentCode = pack.Code;
                    RequestClose?.Invoke(this, EventArgs.Empty);
                    break;

                case LanguagePackService.EnsureResult.AlreadyDownloading:
                    // Another tap started the download — just inform the user and wait.
                    await hostPage!.DisplayAlert(
                        "Đang tải xuống",
                        $"Gói ngôn ngữ '{pack.NativeName}' đang được tải. Vui lòng thử lại sau giây lát.",
                        "OK");
                    break;

                case LanguagePackService.EnsureResult.UserCancelled:
                    // User explicitly cancelled → no action needed, stay open.
                    break;

                case LanguagePackService.EnsureResult.Offline:
                    // Alert was already shown by LanguagePackService. Stay open.
                    break;
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[LANG-SEL] Error selecting language {pack.Code}: {ex}");
        }
        finally
        {
            IsBusy = false;
        }
    }

    // ── INotifyPropertyChanged ───────────────────────────────────────────────

    public event PropertyChangedEventHandler? PropertyChanged;
    private void OnPropertyChanged([CallerMemberName] string name = "")
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
