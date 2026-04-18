namespace MauiApp1.Services.RBEL;

/// <summary>Client-side correlation: rotates on navigation ROEL signals; backend merges journeys.</summary>
public sealed class RbelCorrelationScope
{
    private string _current = Guid.NewGuid().ToString("N");

    public string Current => _current;

    public void OnNavigationEvent()
    {
        _current = Guid.NewGuid().ToString("N");
    }
}
