using System.ComponentModel;
using System.Windows.Input;
using MauiApp1.Services;

namespace MauiApp1.ViewModels;

public class ExploreViewModel : INotifyPropertyChanged
{
    private readonly PoiHydrationService _hydrationService;
    private bool _isRefreshing;

    public ExploreViewModel(PoiHydrationService hydrationService)
    {
        _hydrationService = hydrationService;
        RefreshCommand = new Command(async () => await ExecuteRefreshCommand());
    }

    public bool IsRefreshing
    {
        get => _isRefreshing;
        set
        {
            if (_isRefreshing == value) return;
            _isRefreshing = value;
            OnPropertyChanged();
        }
    }

    public ICommand RefreshCommand { get; }

    private async Task ExecuteRefreshCommand()
    {
        if (IsRefreshing) return;
        IsRefreshing = true;

        try
        {
            // Sync all approved POIs from server into local SQLite
            await _hydrationService.SyncPoisFromServerAsync();
            
            // Optional: Show a small toast or just let the loading finish
            System.Diagnostics.Debug.WriteLine("[EXPLORE] Sync completed manually via Pull-to-refresh");
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[EXPLORE] Sync failed: {ex.Message}");
        }
        finally
        {
            IsRefreshing = false;
        }
    }

    public event PropertyChangedEventHandler? PropertyChanged;
    protected virtual void OnPropertyChanged([System.Runtime.CompilerServices.CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }
}
