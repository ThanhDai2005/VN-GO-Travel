using MauiApp1.Services;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows.Input;
using System.Linq;
using Microsoft.Maui.Controls;
using Microsoft.Maui;

namespace MauiApp1.ViewModels;

public class AvailableLanguage
{
    public string Code { get; set; } = "";
    public string NativeName { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string SizeLabel { get; set; } = "~300 KB";
}

public class AddLanguageViewModel : INotifyPropertyChanged
{
    private readonly MapViewModel _mapVm;
    private readonly LanguagePackService _packService;
    private readonly List<AvailableLanguage> _allSupportedLanguages = new();

    private bool _isBusy;

    public ObservableCollection<AvailableLanguage> FilteredLanguages { get; } = new();

    private string _searchText = "";
    public string SearchText
    {
        get => _searchText;
        set
        {
            if (_searchText != value)
            {
                _searchText = value;
                OnPropertyChanged();
                FilterLanguages();
            }
        }
    }

    public ICommand SelectLanguageCommand { get; }

    public event EventHandler? RequestClose;

    public AddLanguageViewModel(MapViewModel mapVm, LanguagePackService packService)
    {
        _mapVm = mapVm;
        _packService = packService;

        // A modest list of global languages for demo. Real app would have a larger ISO list.
        _allSupportedLanguages = new List<AvailableLanguage>
        {
            new AvailableLanguage { Code = "es", NativeName = "Español", DisplayName = "Spanish", SizeLabel = LanguagePackService.EstimateSizeLabel("es") },
            new AvailableLanguage { Code = "ru", NativeName = "Русский", DisplayName = "Russian", SizeLabel = LanguagePackService.EstimateSizeLabel("ru") },
            new AvailableLanguage { Code = "de", NativeName = "Deutsch", DisplayName = "German", SizeLabel = LanguagePackService.EstimateSizeLabel("de") },
            new AvailableLanguage { Code = "it", NativeName = "Italiano", DisplayName = "Italian", SizeLabel = LanguagePackService.EstimateSizeLabel("it") },
            new AvailableLanguage { Code = "pt", NativeName = "Português", DisplayName = "Portuguese", SizeLabel = LanguagePackService.EstimateSizeLabel("pt") },
            new AvailableLanguage { Code = "ar", NativeName = "العربية", DisplayName = "Arabic", SizeLabel = LanguagePackService.EstimateSizeLabel("ar") },
            new AvailableLanguage { Code = "th", NativeName = "ไทย", DisplayName = "Thai", SizeLabel = LanguagePackService.EstimateSizeLabel("th") },
            new AvailableLanguage { Code = "id", NativeName = "Bahasa Indonesia", DisplayName = "Indonesian", SizeLabel = LanguagePackService.EstimateSizeLabel("id") },
            new AvailableLanguage { Code = "hi", NativeName = "हिन्दी", DisplayName = "Hindi", SizeLabel = LanguagePackService.EstimateSizeLabel("hi") },
        };

        // Filter out those already added
        _allSupportedLanguages.RemoveAll(l => _packService.GetPack(l.Code) != null);

        FilterLanguages();

        SelectLanguageCommand = new Command<AvailableLanguage>(async (l) => await OnLanguageSelectedAsync(l));
    }

    private void FilterLanguages()
    {
        FilteredLanguages.Clear();
        var query = SearchText?.Trim().ToLowerInvariant() ?? "";

        var result = string.IsNullOrEmpty(query)
            ? _allSupportedLanguages
            : _allSupportedLanguages.Where(l =>
                l.Code.Contains(query) ||
                l.NativeName.ToLowerInvariant().Contains(query) ||
                l.DisplayName.ToLowerInvariant().Contains(query));

        foreach (var lang in result)
        {
            FilteredLanguages.Add(lang);
        }
    }

    private async Task OnLanguageSelectedAsync(AvailableLanguage? lang)
    {
        if (lang == null) return;

        if (_isBusy) return;
        _isBusy = true;

        try
        {
            // Add it to the pack list so it becomes selectable globally.
            _packService.AddDynamicLanguage(lang.Code, lang.NativeName, lang.DisplayName);

            // Simulate/ensure a "download" step so UI size label behavior is consistent.
            var hostPage = Application.Current?.Windows.FirstOrDefault()?.Page ?? Shell.Current;
            var ensureResult = await _packService.EnsureAvailableAsync(lang.Code, hostPage!);

            if (ensureResult != LanguagePackService.EnsureResult.Available)
            {
                // EnsureAvailableAsync already showed alert for most cases.
                return;
            }

            // Apply only after the pack is available.
            await _mapVm.ApplyLanguageSelectionAsync(lang.Code);

            // Remove from list since it's added
            _allSupportedLanguages.Remove(lang);
            FilterLanguages();

            RequestClose?.Invoke(this, EventArgs.Empty);
        }
        finally
        {
            _isBusy = false;
        }
    }

    public event PropertyChangedEventHandler? PropertyChanged;
    protected void OnPropertyChanged([CallerMemberName] string name = "")
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
