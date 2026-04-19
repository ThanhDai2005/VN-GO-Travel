using MauiApp1.Models;

namespace MauiApp1.Services;

public interface IEventTracker
{
    void Track(TranslationEvent evt);
}
