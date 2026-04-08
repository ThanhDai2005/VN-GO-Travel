using System.Diagnostics;

namespace MauiApp1.Services;

/// <summary>
/// Centralized navigation authority. 
/// Serializes all modal push/pop transitions to prevent platform-level 
/// race conditions (e.g., calling PopModalAsync twice on an empty stack).
/// Updates <see cref="AppState.ModalCount"/> for background service awareness.
/// </summary>
public class NavigationService : INavigationService
{
    private readonly AppState _appState;
    private readonly SemaphoreSlim _navGate = new(1, 1);

    public NavigationService(AppState appState)
    {
        _appState = appState;
    }

    public async Task PushModalAsync(Page page, bool animated = true)
    {
        if (page == null) return;

        await _navGate.WaitAsync().ConfigureAwait(false);
        try
        {
            var nav = Shell.Current.Navigation;
            Debug.WriteLine($"[NAV] Pushing modal: {page.GetType().Name}. Current stack count: {nav.ModalStack.Count}");
            
            await nav.PushModalAsync(page, animated).ConfigureAwait(false);
            
            // Update state ONLY after successful navigation.
            _appState.ModalCount = nav.ModalStack.Count;
            Debug.WriteLine($"[NAV] Push successful. AppState.ModalCount={_appState.ModalCount}");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[NAV-ERR] PushModalAsync failure: {ex.Message}");
        }
        finally
        {
            _navGate.Release();
        }
    }

    public async Task PopModalAsync(bool animated = true)
    {
        await _navGate.WaitAsync().ConfigureAwait(false);
        try
        {
            var nav = Shell.Current.Navigation;
            if (nav.ModalStack.Count == 0)
            {
                Debug.WriteLine("[NAV] PopModalAsync ignored: Modal stack is already empty.");
                _appState.ModalCount = 0; // Sync state just in case.
                return;
            }

            Debug.WriteLine($"[NAV] Popping modal. Current stack count: {nav.ModalStack.Count}");
            await nav.PopModalAsync(animated).ConfigureAwait(false);
            
            _appState.ModalCount = nav.ModalStack.Count;
            Debug.WriteLine($"[NAV] Pop successful. AppState.ModalCount={_appState.ModalCount}");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[NAV-ERR] PopModalAsync failure: {ex.Message}");
        }
        finally
        {
            _navGate.Release();
        }
    }
}
