namespace MauiApp1.Services;

public interface INavigationService
{
    Task PushModalAsync(Page page, bool animated = true);
    Task PopModalAsync(bool animated = true);
}
