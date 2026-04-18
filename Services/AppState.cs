using Microsoft.Maui.Devices.Sensors;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using MauiApp1.Models;

namespace MauiApp1.Services;

/// <summary>
/// Singleton service for tracking global application state.
/// This is the Single Source of Truth for POIs, Selection, Language, and UI status.
/// </summary>
public class AppState : INotifyPropertyChanged
{
    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnPropertyChanged([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));

    // ── UI / Modal State ─────────────────────────────────────────────────────

    private int _modalCount;
    public int ModalCount
    {
        get => _modalCount;
        set
        {
            if (_modalCount == value) return;
            _modalCount = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(IsModalOpen));
        }
    }

    public bool IsModalOpen => ModalCount > 0;

    // ── Location State ───────────────────────────────────────────────────────

    private Location? _currentLocation;
    public Location? CurrentLocation
    {
        get => _currentLocation;
        set
        {
            _currentLocation = value;
            OnPropertyChanged();
        }
    }

    // ── Global Data & Selection ──────────────────────────────────────────────

    private string _currentLanguage = "vi";
    public string CurrentLanguage
    {
        get => _currentLanguage;
        set
        {
            if (_currentLanguage != value)
            {
                _currentLanguage = value;
                OnPropertyChanged();
                LanguageChanged?.Invoke(this, value);
            }
        }
    }

    private ObservableCollection<Poi> _pois = new();
    public ObservableCollection<Poi> Pois
    {
        get => _pois;
        set
        {
            _pois = value;
            OnPropertyChanged();
            PoisChanged?.Invoke(this, EventArgs.Empty);
        }
    }

    private Poi? _selectedPoi;
    public Poi? SelectedPoi
    {
        get => _selectedPoi;
        private set
        {
            if (_selectedPoi != value)
            {
                _selectedPoi = value;
                OnPropertyChanged();
                SelectedPoiChanged?.Invoke(this, value);
            }
        }
    }

    /// <summary>
    /// Map State Arbitration Layer (7.2.4): the only supported mutation path for map selection.
    /// </summary>
    internal void CommitSelectedPoiForUi(Poi? value) => SelectedPoi = value;

    private string? _activeNarrationCode;
    public string? ActiveNarrationCode
    {
        get => _activeNarrationCode;
        set
        {
            if (_activeNarrationCode != value)
            {
                _activeNarrationCode = value;
                OnPropertyChanged();
            }
        }
    }

    private bool _isTranslating;
    public bool IsTranslating
    {
        get => _isTranslating;
        set
        {
            if (_isTranslating != value)
            {
                _isTranslating = value;
                OnPropertyChanged();
            }
        }
    }

    // ── Convenience Events for Services ──────────────────────────────────────

    public event EventHandler<string>? LanguageChanged;
    public event EventHandler<Poi?>? SelectedPoiChanged;
    public event EventHandler? PoisChanged;

}
