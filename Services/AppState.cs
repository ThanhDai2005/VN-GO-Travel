namespace MauiApp1.Services;

/// <summary>
/// Singleton service for tracking global application state.
/// Used to synchronize UI-related events and background services.
/// </summary>
public class AppState
{
    private int _modalCount;

    /// <summary>
    /// Current number of active modal pages. 
    /// Updated solely by <see cref="NavigationService"/>.
    /// </summary>
    public int ModalCount
    {
        get => _modalCount;
        set
        {
            if (_modalCount == value) return;
            _modalCount = value;
            // Additional property changed events or logging could go here.
        }
    }

    /// <summary>
    /// True when any modal interface is currently obscuring the main view.
    /// Background services (like the Map tracking loop) should check this before
    /// performing UI-heavy or audio-triggering iterations.
    /// </summary>
    public bool IsModalOpen => ModalCount > 0;
}
