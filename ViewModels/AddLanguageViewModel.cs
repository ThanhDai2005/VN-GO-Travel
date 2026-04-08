using MauiApp1.Services;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows.Input;
using System.Linq;

namespace MauiApp1.ViewModels;

public class AvailableLanguage
{
    public string Code { get; set; } = "";
    public string NativeName { get; set; } = "";
    public string DisplayName { get; set; } = "";
}

public class AddLanguageViewModel : INotifyPropertyChanged
{
    private readonly LanguagePackService _packService;
    private readonly List<AvailableLanguage> _allSupportedLanguages = new();

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

    public AddLanguageViewModel(LanguagePackService packService)
    {
        _packService = packService;

        // A modest list of global languages for demo. Real app would have a larger ISO list.
        _allSupportedLanguages = new List<AvailableLanguage>
        {
            new AvailableLanguage { Code = "es", NativeName = "Español", DisplayName = "Spanish" },
            new AvailableLanguage { Code = "ru", NativeName = "Русский", DisplayName = "Russian" },
            new AvailableLanguage { Code = "de", NativeName = "Deutsch", DisplayName = "German" },
            new AvailableLanguage { Code = "it", NativeName = "Italiano", DisplayName = "Italian" },
            new AvailableLanguage { Code = "pt", NativeName = "Português", DisplayName = "Portuguese" },
            new AvailableLanguage { Code = "ar", NativeName = "العربية", DisplayName = "Arabic" },
            new AvailableLanguage { Code = "th", NativeName = "ไทย", DisplayName = "Thai" },
            new AvailableLanguage { Code = "id", NativeName = "Bahasa Indonesia", DisplayName = "Indonesian" },
            new AvailableLanguage { Code = "hi", NativeName = "हिन्दी", DisplayName = "Hindi" },
        };

        // Filter out those already added
        _allSupportedLanguages.RemoveAll(l => _packService.GetPack(l.Code) != null);

        FilterLanguages();

        SelectLanguageCommand = new Command<AvailableLanguage>(OnLanguageSelected);
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

    private void OnLanguageSelected(AvailableLanguage? lang)
    {
        if (lang == null) return;
        
        _packService.AddDynamicLanguage(lang.Code, lang.NativeName, lang.DisplayName);
        
        // Remove from list since it's added
        _allSupportedLanguages.Remove(lang);
        FilterLanguages();

        RequestClose?.Invoke(this, EventArgs.Empty);
    }

    public event PropertyChangedEventHandler? PropertyChanged;
    protected void OnPropertyChanged([CallerMemberName] string name = "")
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
